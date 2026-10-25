import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAppDetails, getStoreAssets, searchStore, steamCoverUrl, type StoreAppDetails, type StoreAssets } from "@/lib/steam/api";
import { searchLocalGames } from "@/lib/search";
import { didYouMean, normalizeQuery, sameTitle } from "@/lib/search-query";

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
  source: "GameLog" | "Steam" | "RAWG";
};

export type SearchResponse = { results: SearchResult[]; didYouMean: string | null };

const RAWG_API = "https://api.rawg.io/api";
const TIMEOUT_MS = 10_000;

type RawgGame = {
  id: number;
  name: string;
  background_image: string | null;
  released: string | null;
  tba?: boolean;
  /** Média de horas jogadas na Steam (a RAWG cruza com os dados da Steam) */
  playtime?: number;
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

/**
 * Busca em três fontes, nesta ordem: jogos já conhecidos no GameLog (tolerante a erro de
 * digitação, ver lib/search.ts), loja da Steam e RAWG. Se a loja não achar quase nada e
 * houver um título parecido no banco, busca de novo na loja com o título certo.
 */
export async function searchGames(query: string): Promise<SearchResponse> {
  const q = normalizeQuery(query);
  if (q.length < 2) return { results: [], didYouMean: null };

  const [local, steamFirst, rawg] = await Promise.all([
    searchLocalGames(q, 8).catch((err) => {
      console.error("[busca] local", err);
      return [];
    }),
    searchStore(q),
    rawgGet<{ results: RawgGame[] }>("/games", { search: q, page_size: "12" }),
  ]);

  // "zelda breth": a loja não acha nada, mas o banco sabe o título certo
  const suggestion = didYouMean(q, local[0]);
  const steamAll = steamFirst.length < 3 && suggestion ? [...steamFirst, ...(await searchStore(suggestion))] : steamFirst;
  const steam = steamAll.filter((s, i, all) => all.findIndex((x) => x.appId === s.appId) === i).slice(0, 12);
  const assets = await getStoreAssets(steam.map((s) => s.appId));

  const localResults: SearchResult[] = local.map((g) => ({
    slug: g.slug,
    title: g.title,
    coverUrl: g.coverUrl,
    steamAppId: g.steamAppId,
    year: g.year,
    source: "GameLog",
  }));
  const knownSteam = new Set(local.flatMap((g) => (g.steamAppId ? [g.steamAppId] : [])));
  const knownSlugs = new Set(local.map((g) => g.slug));

  const steamResults: SearchResult[] = steam.filter((s) => !knownSteam.has(s.appId) && !knownSlugs.has(`steam-${s.appId}`)).map((s) => ({
    slug: `steam-${s.appId}`,
    title: s.name,
    coverUrl: coverFrom(assets.get(s.appId), s.appId),
    steamAppId: s.appId,
    year: null,
    source: "Steam",
  }));

  // RAWG sem os que já vieram de outra fonte com o mesmo nome
  const seenTitles = [...localResults, ...steamResults].map((r) => r.title);
  const rawgResults: SearchResult[] = (rawg?.results ?? [])
    .filter((g) => !knownSlugs.has(`rawg-${g.id}`) && !seenTitles.some((t) => sameTitle(t, g.name)))
    .map((g) => ({
      slug: `rawg-${g.id}`,
      title: g.name,
      coverUrl: g.background_image,
      steamAppId: null,
      year: g.released ? Number(g.released.slice(0, 4)) : null,
      source: "RAWG",
    }));

  return {
    results: [...localResults, ...steamResults, ...rawgResults],
    // Só mostra a sugestão quando ela trouxe algo que a busca original não trazia
    didYouMean: suggestion && steamFirst.length < 3 ? suggestion : null,
  };
}

/** Acha o jogo pelo slug; se ainda não existe e o slug é de uma fonte conhecida, cria. */
export async function getOrCreateGame(slug: string) {
  const existing = await prisma.game.findUnique({ where: { slug } });
  if (existing) {
    // Sem preço salvo = veio de antes do campo existir: renova já
    const stale =
      !existing.mediaSyncedAt || !existing.priceCheckedAt || Date.now() - existing.mediaSyncedAt.getTime() > MEDIA_TTL_MS;
    return existing.steamAppId && (!existing.syncedAt || stale)
      ? enrichFromSteam(existing.id, existing.steamAppId, existing.coverUrl)
      : existing;
  }

  const steamMatch = slug.match(/^steam-(\d{1,10})$/);
  if (steamMatch) {
    const appId = Number(steamMatch[1]);
    const [details, assets] = await Promise.all([getAppDetails(appId), getStoreAssets([appId])]);
    if (!details) return null;
    return upsertGame({ steamAppId: appId }, {
      slug,
      steamAppId: appId,
      coverUrl: coverFrom(assets.get(appId), appId),
      ...steamDetailsData(details, assets.get(appId)),
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
      releaseDate: g.released && !g.tba ? new Date(g.released) : null,
      comingSoon: Boolean(g.tba) || (g.released ? new Date(g.released).getTime() > Date.now() : false),
      releaseDateText: g.tba ? "A anunciar" : null,
      rawgPlaytimeHours: g.playtime ? Math.min(g.playtime, 32767) : null,
      rawgPlaytimeCheckedAt: new Date(),
      syncedAt: new Date(),
    });
  }

  return null;
}

/** Mídia e Metascore mudam pouco: renova a cada 7 dias, na visita à página do jogo. */
const MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Campos de `games` que vêm da página da loja. */
function steamDetailsData(details: StoreAppDetails, assets: StoreAssets | undefined) {
  const now = new Date();
  return {
    title: details.name,
    summary: details.summary,
    genres: details.genres,
    platforms: details.platforms,
    releaseDate: details.releaseDate,
    releaseDateText: details.releaseDateText,
    comingSoon: details.comingSoon,
    developers: details.developers,
    publishers: details.publishers,
    metacriticScore: details.metacritic?.score ?? null,
    metacriticUrl: details.metacritic?.url ?? null,
    heroUrl: assets?.hero ?? null,
    screenshots: details.screenshots,
    trailers: details.trailers,
    priceFinal: details.price?.final ?? null,
    priceOriginal: details.price?.original ?? null,
    discountPercent: details.price?.discountPercent ?? null,
    priceCheckedAt: now,
    syncedAt: now,
    mediaSyncedAt: now,
  };
}

/** Completa / renova um jogo da Steam com a loja (ficha, mídia, Metascore e, se faltar, a capa real). */
export async function enrichFromSteam(gameId: string, appId: number, coverUrl: string | null) {
  const needsCover = !coverUrl || coverUrl === steamCoverUrl(appId);
  const [details, assets] = await Promise.all([getAppDetails(appId), getStoreAssets([appId])]);
  const asset = assets.get(appId);
  return prisma.game.update({
    where: { id: gameId },
    data: details
      ? { ...(needsCover ? { coverUrl: coverFrom(asset, appId) } : {}), ...steamDetailsData(details, asset) }
      : { syncedAt: new Date(), mediaSyncedAt: new Date() }, // app removido da loja: não tenta de novo a cada visita
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

/** Renova data de lançamento e situação de um jogo que só existe na RAWG. */
export async function refreshFromRawg(gameId: string, rawgId: number) {
  const g = await rawgGet<RawgGame>(`/games/${rawgId}`);
  if (!g) return null;
  return prisma.game.update({
    where: { id: gameId },
    data: {
      releaseDate: g.released && !g.tba ? new Date(g.released) : null,
      comingSoon: Boolean(g.tba) || (g.released ? new Date(g.released).getTime() > Date.now() : false),
      releaseDateText: g.tba ? "A anunciar" : null,
      rawgPlaytimeHours: g.playtime ? Math.min(g.playtime, 32767) : null,
      rawgPlaytimeCheckedAt: new Date(),
      syncedAt: new Date(),
    },
  });
}

/**
 * Média de horas na Steam segundo a RAWG. Jogos da Steam não têm id da RAWG, então
 * busca pelo título e só aceita nome igual (ignorando acento/pontuação).
 * `undefined` = RAWG fora ou sem chave (tenta de novo depois); `null` = não achou.
 */
export async function lookupRawgPlaytime(game: { title: string; rawgId: number | null }): Promise<number | null | undefined> {
  if (!process.env.RAWG_API_KEY) return undefined;
  if (game.rawgId) {
    const g = await rawgGet<RawgGame>(`/games/${game.rawgId}`);
    return g ? (g.playtime || null) : undefined;
  }
  const list = await rawgGet<{ results: RawgGame[] }>("/games", { search: game.title, page_size: "5" });
  if (!list) return undefined;
  const match = list.results.find((r) => sameTitle(r.name, game.title));
  return match?.playtime || null;
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
