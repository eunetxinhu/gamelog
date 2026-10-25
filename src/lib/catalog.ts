import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAppDetails, getStoreAssets, searchStore, steamCoverUrl, type StoreAssets } from "@/lib/steam/api";

/**
 * Catálogo de jogos. Fontes:
 *  - Loja da Steam (sem chave): slug "steam-<appid>"
 *  - RAWG (opcional, RAWG_API_KEY): slug "rawg-<id>" — cobre jogos de console
 * O jogo só vira linha em `games` quando alguém abre a página dele (getOrCreateGame).
 */

export type SearchResult = {
  slug: string;
  title: string;
  coverUrl: string | null;
  steamAppId: number | null;
  year: number | null;
  source: "Steam" | "RAWG";
};

const RAWG_API = "https://api.rawg.io/api";
const TIMEOUT_MS = 10_000;

type RawgGame = {
  id: number;
  name: string;
  background_image: string | null;
  released: string | null;
  description_raw?: string;
  genres?: { name: string }[];
  platforms?: { platform: { name: string } }[] | null;
};

async function rawgGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.RAWG_API_KEY;
  if (!key) return null;
  const url = new URL(`${RAWG_API}${path}`);
  url.search = new URLSearchParams({ key, ...params }).toString();
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function searchGames(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [steamAll, rawg] = await Promise.all([
    searchStore(q),
    rawgGet<{ results: RawgGame[] }>("/games", { search: q, page_size: "12" }),
  ]);
  const steam = steamAll.slice(0, 12);
  const assets = await getStoreAssets(steam.map((s) => s.appId));

  const steamResults: SearchResult[] = steam.map((s) => ({
    slug: `steam-${s.appId}`,
    title: s.name,
    coverUrl: coverFrom(assets.get(s.appId), s.appId),
    steamAppId: s.appId,
    year: null,
    source: "Steam",
  }));

  // RAWG sem os que já vieram da Steam com o mesmo nome
  const seen = new Set(steamResults.map((r) => r.title.toLowerCase()));
  const rawgResults: SearchResult[] = (rawg?.results ?? [])
    .filter((g) => !seen.has(g.name.toLowerCase()))
    .map((g) => ({
      slug: `rawg-${g.id}`,
      title: g.name,
      coverUrl: g.background_image,
      steamAppId: null,
      year: g.released ? Number(g.released.slice(0, 4)) : null,
      source: "RAWG",
    }));

  return [...steamResults, ...rawgResults];
}

/** Acha o jogo pelo slug; se ainda não existe e o slug é de uma fonte conhecida, cria. */
export async function getOrCreateGame(slug: string) {
  const existing = await prisma.game.findUnique({ where: { slug } });
  if (existing) {
    return existing.steamAppId && !existing.syncedAt ? enrichFromSteam(existing.id, existing.steamAppId, existing.coverUrl) : existing;
  }

  const steamMatch = slug.match(/^steam-(\d{1,10})$/);
  if (steamMatch) {
    const appId = Number(steamMatch[1]);
    const [details, assets] = await Promise.all([getAppDetails(appId), getStoreAssets([appId])]);
    if (!details) return null;
    return upsertGame({ steamAppId: appId }, {
      slug,
      title: details.name,
      steamAppId: appId,
      coverUrl: coverFrom(assets.get(appId), appId),
      summary: details.summary,
      genres: details.genres,
      platforms: details.platforms,
      releaseDate: details.releaseDate,
      syncedAt: new Date(),
    });
  }

  const rawgMatch = slug.match(/^rawg-(\d{1,10})$/);
  if (rawgMatch) {
    const g = await rawgGet<RawgGame>(`/games/${rawgMatch[1]}`);
    if (!g) return null;
    return upsertGame({ rawgId: g.id }, {
      slug,
      title: g.name,
      rawgId: g.id,
      coverUrl: g.background_image,
      summary: g.description_raw?.trim().slice(0, 1200) || null,
      genres: g.genres?.map((x) => x.name) ?? [],
      platforms: g.platforms?.map((p) => p.platform.name) ?? [],
      releaseDate: g.released ? new Date(g.released) : null,
      syncedAt: new Date(),
    });
  }

  return null;
}

/** Jogos importados da biblioteca Steam chegam só com nome e capa: completa com a loja. */
async function enrichFromSteam(gameId: string, appId: number, coverUrl: string | null) {
  const needsCover = !coverUrl || coverUrl === steamCoverUrl(appId);
  const [details, assets] = await Promise.all([getAppDetails(appId), needsCover ? getStoreAssets([appId]) : null]);
  return prisma.game.update({
    where: { id: gameId },
    data: details
      ? {
          ...(needsCover ? { coverUrl: coverFrom(assets?.get(appId), appId) } : {}),
          title: details.name,
          summary: details.summary,
          genres: details.genres,
          platforms: details.platforms,
          releaseDate: details.releaseDate,
          syncedAt: new Date(),
        }
      : { syncedAt: new Date() }, // app removido da loja: não tenta de novo a cada visita
  });
}

/** Cria o jogo; se outra requisição criou junto (mesmo id externo), devolve o existente. */
async function upsertGame(where: Prisma.GameWhereUniqueInput, data: Prisma.GameCreateInput) {
  try {
    return await prisma.game.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.game.findUnique({ where });
    }
    throw err;
  }
}

/** Capa vertical real; sem ela, o banner; sem nada, a URL fixa (o GameCover ainda tenta o fallback). */
function coverFrom(assets: StoreAssets | undefined, appId: number) {
  return assets?.cover ?? assets?.header ?? steamCoverUrl(appId);
}

/**
 * Troca a URL fixa da capa (chute que dá 404 em jogos novos) pela real, em lote.
 * Chamado depois da sincronização da Steam. Falhas são ignoradas.
 */
export async function resolveSteamCovers(appIds: number[]) {
  const games = await prisma.game.findMany({
    where: { steamAppId: { in: appIds } },
    select: { id: true, steamAppId: true, coverUrl: true },
  });
  const pending = games.filter((g) => g.coverUrl === steamCoverUrl(g.steamAppId!));
  if (pending.length === 0) return;

  const assets = await getStoreAssets(pending.map((g) => g.steamAppId!));
  const updates = pending
    .map((g) => ({ id: g.id, url: coverFrom(assets.get(g.steamAppId!), g.steamAppId!) }))
    .filter((u, i) => u.url !== pending[i].coverUrl);
  if (updates.length === 0) return;

  await prisma.$executeRaw`
    UPDATE games SET cover_url = t.url, updated_at = now()
    FROM unnest(${updates.map((u) => u.id)}::text[], ${updates.map((u) => u.url)}::text[]) AS t(id, url)
    WHERE games.id = t.id
  `;
}
