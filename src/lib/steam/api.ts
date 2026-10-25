import "server-only";
import { parseStoreRelease } from "./dates";

/**
 * Cliente mínimo da Steam Web API.
 * Todas as funções devolvem um Result tipado em vez de lançar exceção, para que
 * a Server Action consiga mapear cada falha a um código amigável para a UI.
 */

const STEAM_API = "https://api.steampowered.com";
const TIMEOUT_MS = 10_000;

// ---- Tipos das respostas -----------------------------------------------------

export type SteamOwnedGame = {
  appid: number;
  name?: string; // presente com include_appinfo=1
  playtime_forever: number; // minutos
  playtime_2weeks?: number; // minutos
  img_icon_url?: string;
  rtime_last_played?: number; // unix seconds (0 = nunca)
};

export type SteamRecentGame = {
  appid: number;
  name?: string;
  playtime_2weeks: number;
  playtime_forever: number;
};

export type SteamPlayerSummary = {
  steamid: string;
  personaname: string;
  avatarfull: string;
  /** 1 = privado/amigos, 3 = público */
  communityvisibilitystate: number;
  profilestate?: number;
};

/**
 * Atenção ao formato: quando os "Detalhes dos jogos" estão privados, a Steam
 * responde 200 OK com `{ "response": {} }` — sem `games` e sem `game_count`.
 * Por isso os campos são opcionais e precisam ser checados explicitamente.
 */
type OwnedGamesResponse = { response: { game_count?: number; games?: SteamOwnedGame[] } };
type RecentGamesResponse = { response: { total_count?: number; games?: SteamRecentGame[] } };
type PlayerSummariesResponse = { response: { players: SteamPlayerSummary[] } };

export type SteamFetchError =
  | { kind: "RATE_LIMITED" }
  | { kind: "BAD_API_KEY" }
  | { kind: "UNAVAILABLE"; status?: number }
  | { kind: "TIMEOUT" };

export type SteamResult<T> = { ok: true; data: T } | { ok: false; error: SteamFetchError };

// ---- Infra ---------------------------------------------------------------

function apiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new Error("STEAM_API_KEY não configurada");
  return key;
}

async function steamGet<T>(path: string, params: Record<string, string | number>): Promise<SteamResult<T>> {
  const url = new URL(`${STEAM_API}${path}`);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") return { ok: false, error: { kind: "TIMEOUT" } };
    return { ok: false, error: { kind: "UNAVAILABLE" } };
  }

  if (res.status === 429) return { ok: false, error: { kind: "RATE_LIMITED" } };
  if (res.status === 401 || res.status === 403) return { ok: false, error: { kind: "BAD_API_KEY" } };
  if (!res.ok) return { ok: false, error: { kind: "UNAVAILABLE", status: res.status } };

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, error: { kind: "UNAVAILABLE", status: res.status } };
  }
}

// ---- Endpoints -------------------------------------------------------------

export async function getPlayerSummary(steamId: string): Promise<SteamResult<SteamPlayerSummary | null>> {
  const r = await steamGet<PlayerSummariesResponse>("/ISteamUser/GetPlayerSummaries/v2/", { steamids: steamId });
  if (!r.ok) return r;
  return { ok: true, data: r.data.response.players?.[0] ?? null };
}

export async function getOwnedGames(steamId: string) {
  const r = await steamGet<OwnedGamesResponse>("/IPlayerService/GetOwnedGames/v1/", {
    steamid: steamId,
    include_appinfo: 1,
    include_played_free_games: 1,
  });
  if (!r.ok) return r;
  return { ok: true as const, data: r.data.response };
}

export async function getRecentlyPlayedGames(steamId: string) {
  const r = await steamGet<RecentGamesResponse>("/IPlayerService/GetRecentlyPlayedGames/v1/", {
    steamid: steamId,
    count: 0, // 0 = todos os jogos das últimas 2 semanas
  });
  if (!r.ok) return r;
  return { ok: true as const, data: r.data.response };
}

export type AchievementProgress = { unlocked: number; total: number; lastUnlockAt: Date | null };

/**
 * Progresso de conquistas de um jogo. Devolve `null` quando não dá para saber
 * (jogo sem conquistas, conquistas privadas, erro da Steam): quem chama só pula o jogo.
 * Não usa `steamGet` porque aqui 400/403 são respostas normais, não chave inválida.
 */
export async function getPlayerAchievements(steamId: string, appId: number): Promise<AchievementProgress | null> {
  const url = new URL(`${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/`);
  url.search = new URLSearchParams({ key: apiKey(), steamid: steamId, appid: String(appId) }).toString();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      playerstats?: { success?: boolean; achievements?: { achieved: number; unlocktime: number }[] };
    };
    const list = body.playerstats?.success ? body.playerstats.achievements : undefined;
    if (!list?.length) return null;
    const done = list.filter((a) => a.achieved === 1);
    const last = Math.max(0, ...done.map((a) => a.unlocktime));
    return { unlocked: done.length, total: list.length, lastUnlockAt: last ? new Date(last * 1000) : null };
  } catch {
    return null;
  }
}

/**
 * SteamIDs dos amigos. `null` quando a lista de amigos é privada (a Steam responde 401)
 * ou a Steam falhou. Cache de 1 hora.
 */
export async function getFriendList(steamId: string): Promise<string[] | null> {
  try {
    const url = new URL(`${STEAM_API}/ISteamUser/GetFriendList/v1/`);
    url.search = new URLSearchParams({ key: apiKey(), steamid: steamId, relationship: "friend" }).toString();
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { friendslist?: { friends?: { steamid: string }[] } };
    return body.friendslist?.friends?.map((f) => f.steamid) ?? [];
  } catch {
    return null;
  }
}

// ---- Conquistas com nome, ícone e raridade ------------------------------------

export type AchievementDetail = {
  apiName: string;
  name: string;
  description: string | null;
  icon: string;
  iconGray: string;
  hidden: boolean;
  /** % dos jogadores da Steam que têm essa conquista */
  percent: number | null;
  achieved: boolean;
  unlockedAt: Date | null;
};

/**
 * Lista completa das conquistas de um jogo, com a raridade global e, se `steamId`
 * vier, o progresso da pessoa. `null` quando o jogo não tem conquistas.
 * Lista e raridade mudam pouco (cache de 1 dia); o progresso é sempre buscado na hora.
 */
export async function getAchievementDetails(appId: number, steamId: string | null): Promise<AchievementDetail[] | null> {
  const day = { next: { revalidate: 86400 }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  const schemaUrl = new URL(`${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/`);
  schemaUrl.search = new URLSearchParams({ key: apiKey(), appid: String(appId), l: "brazilian" }).toString();

  type Schema = {
    game?: { availableGameStats?: { achievements?: { name: string; displayName: string; description?: string; icon: string; icongray: string; hidden: number }[] } };
  };

  try {
    const [schemaRes, percentBy, mine] = await Promise.all([
      fetch(schemaUrl, day),
      getGlobalAchievementPercentages(appId).then((m) => m ?? new Map<string, number>()),
      steamId ? getPlayerAchievementList(steamId, appId) : Promise.resolve(null),
    ]);
    if (!schemaRes.ok) return null;
    const schema = ((await schemaRes.json()) as Schema).game?.availableGameStats?.achievements;
    if (!schema?.length) return null;

    return schema.map((a) => {
      const m = mine?.get(a.name);
      return {
        apiName: a.name,
        name: a.displayName,
        description: a.description?.trim() || null,
        icon: a.icon,
        iconGray: a.icongray,
        hidden: a.hidden === 1,
        percent: percentBy.has(a.name) ? percentBy.get(a.name)! : null,
        achieved: m?.achieved ?? false,
        unlockedAt: m?.unlockedAt ?? null,
      };
    });
  } catch {
    return null;
  }
}

/** % de jogadores com cada conquista (sem API key; cache de 1 dia). `null` se o jogo não tem conquistas. */
export async function getGlobalAchievementPercentages(appId: number): Promise<Map<string, number> | null> {
  try {
    const res = await fetch(`${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appId}`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } };
    const list = body.achievementpercentages?.achievements;
    return list?.length ? new Map(list.map((a) => [a.name, Number(a.percent)])) : null;
  } catch {
    return null;
  }
}

async function getPlayerAchievementList(steamId: string, appId: number) {
  const url = new URL(`${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/`);
  url.search = new URLSearchParams({ key: apiKey(), steamid: steamId, appid: String(appId) }).toString();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { playerstats?: { success?: boolean; achievements?: { apiname: string; achieved: number; unlocktime: number }[] } };
    if (!body.playerstats?.success) return null;
    return new Map(
      (body.playerstats.achievements ?? []).map((a) => [
        a.apiname,
        { achieved: a.achieved === 1, unlockedAt: a.unlocktime ? new Date(a.unlocktime * 1000) : null },
      ]),
    );
  } catch {
    return null;
  }
}

// ---- Imagens com o caminho real (IStoreBrowseService, sem API key) -------------

export type StoreAssets = { cover: string | null; header: string | null; hero: string | null };

const ASSET_BASE = "https://shared.akamai.steamstatic.com/store_item_assets/";

/**
 * Caminho real das imagens de cada app. Jogos mais novos (e alguns antigos) guardam
 * as imagens em `/apps/<id>/<hash>/arquivo.jpg`, então a URL fixa de `steamCoverUrl` dá 404.
 * Apps que não existem simplesmente não aparecem no Map.
 */
export async function getStoreAssets(appIds: number[]): Promise<Map<number, StoreAssets>> {
  const out = new Map<number, StoreAssets>();
  for (let i = 0; i < appIds.length; i += 100) {
    const ids = appIds.slice(i, i + 100);
    const url = new URL(`${STEAM_API}/IStoreBrowseService/GetItems/v1/`);
    url.searchParams.set(
      "input_json",
      JSON.stringify({
        ids: ids.map((appid) => ({ appid })),
        context: { language: "brazilian", country_code: "BR" },
        data_request: { include_assets: true },
      }),
    );
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        response?: {
          store_items?: {
            appid?: number;
            success: number;
            assets?: { asset_url_format?: string; library_capsule?: string; header?: string; library_hero?: string };
          }[];
        };
      };
      for (const item of body.response?.store_items ?? []) {
        const a = item.assets;
        if (item.success !== 1 || !item.appid || !a?.asset_url_format) continue;
        const build = (file?: string) => (file ? ASSET_BASE + a.asset_url_format!.replace("${FILENAME}", file) : null);
        out.set(item.appid, { cover: build(a.library_capsule), header: build(a.header), hero: build(a.library_hero) });
      }
    } catch {
      // lote falhou: esses jogos ficam com a URL fixa e o GameCover faz o fallback
    }
  }
  return out;
}

// ---- Loja (store.steampowered.com, sem API key) -------------------------------

const STORE_API = "https://store.steampowered.com/api";

export type StoreSearchItem = { appId: number; name: string };

/** Busca na loja da Steam (só jogos). */
export async function searchStore(term: string): Promise<StoreSearchItem[]> {
  const url = new URL(`${STORE_API}/storesearch/`);
  url.search = new URLSearchParams({ term, l: "portuguese", cc: "BR" }).toString();
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: { id: number; name: string; type: string }[] };
    return (body.items ?? []).filter((i) => i.type === "app").map((i) => ({ appId: i.id, name: i.name }));
  } catch {
    return [];
  }
}

export type Screenshot = { thumb: string; full: string };
export type Trailer = { name: string; thumb: string; hls: string };

export type StoreAppDetails = {
  name: string;
  summary: string | null;
  genres: string[];
  platforms: string[];
  /** Só com dia exato */
  releaseDate: Date | null;
  /** Texto da loja quando não há dia exato ("Em breve", "Q1 2027") */
  releaseDateText: string | null;
  comingSoon: boolean;
  developers: string[];
  publishers: string[];
  metacritic: { score: number; url: string | null } | null;
  screenshots: Screenshot[];
  trailers: Trailer[];
  price: SteamPrice | null;
};

/** Preço em centavos (BRL). null em jogos grátis ou sem venda. */
export type SteamPrice = { final: number; original: number; discountPercent: number };

/** Detalhes da página da loja (descrição, gêneros, data). `null` se o app não existir. */
export async function getAppDetails(appId: number): Promise<StoreAppDetails | null> {
  const url = new URL(`${STORE_API}/appdetails`);
  url.search = new URLSearchParams({ appids: String(appId), l: "portuguese", cc: "BR" }).toString();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<
      string,
      {
        success: boolean;
        data?: {
          name: string;
          short_description?: string;
          genres?: { description: string }[];
          platforms?: Record<string, boolean>;
          release_date?: { date?: string; coming_soon?: boolean };
          developers?: string[];
          publishers?: string[];
          metacritic?: { score: number; url?: string };
          screenshots?: { path_thumbnail: string; path_full: string }[];
          movies?: { name: string; thumbnail: string; hls_h264?: string }[];
          price_overview?: { final: number; initial: number; discount_percent: number };
        };
      }
    >;
    const data = body[String(appId)]?.success ? body[String(appId)].data : undefined;
    if (!data) return null;
    const PLATFORM_NAMES: Record<string, string> = { windows: "PC", mac: "macOS", linux: "Linux" };
    return {
      name: data.name,
      summary: data.short_description?.trim() || null,
      genres: data.genres?.map((g) => g.description) ?? [],
      platforms: Object.entries(data.platforms ?? {}).flatMap(([k, on]) => (on && PLATFORM_NAMES[k] ? [PLATFORM_NAMES[k]] : [])),
      ...(() => {
        const release = parseStoreRelease(data.release_date?.date);
        const comingSoon = Boolean(data.release_date?.coming_soon);
        // Já lançado sem data legível: não guarda texto (não vai para o calendário)
        return { releaseDate: release.date, releaseDateText: comingSoon ? release.text : null, comingSoon };
      })(),
      developers: data.developers ?? [],
      publishers: data.publishers ?? [],
      metacritic: data.metacritic?.score ? { score: data.metacritic.score, url: data.metacritic.url ?? null } : null,
      screenshots: (data.screenshots ?? []).slice(0, 12).map((x) => ({ thumb: x.path_thumbnail, full: x.path_full })),
      trailers: (data.movies ?? [])
        .filter((m) => m.hls_h264)
        .slice(0, 4)
        .map((m) => ({ name: m.name, thumb: m.thumbnail, hls: m.hls_h264! })),
      price: data.price_overview
        ? { final: data.price_overview.final, original: data.price_overview.initial, discountPercent: data.price_overview.discount_percent }
        : null,
    };
  } catch {
    return null;
  }
}

/**
 * Preços de vários jogos de uma vez (loja, sem chave). Jogos grátis ou fora de venda
 * voltam com `null`; apps que falharam não aparecem no Map.
 */
export async function getPrices(appIds: number[]): Promise<Map<number, SteamPrice | null>> {
  const out = new Map<number, SteamPrice | null>();
  for (let i = 0; i < appIds.length; i += 50) {
    const ids = appIds.slice(i, i + 50);
    try {
      const res = await fetch(`${STORE_API}/appdetails?appids=${ids.join(",")}&filters=price_overview&cc=BR`, {
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as Record<
        string,
        { success: boolean; data?: { price_overview?: { final: number; initial: number; discount_percent: number } } | [] }
      >;
      for (const id of ids) {
        const item = body[String(id)];
        if (!item?.success) continue;
        const p = !Array.isArray(item.data) ? item.data?.price_overview : undefined;
        out.set(id, p ? { final: p.final, original: p.initial, discountPercent: p.discount_percent } : null);
      }
    } catch {
      // lote falhou: tenta de novo no próximo cron
    }
  }
  return out;
}

export type StoreListItem = {
  appId: number;
  name: string;
  image: string;
  discountPercent: number;
  /** centavos (BRL); null = sem preço (em breve / grátis) */
  finalPrice: number | null;
  originalPrice: number | null;
};

export type StoreHighlights = { topSellers: StoreListItem[]; newReleases: StoreListItem[]; comingSoon: StoreListItem[]; specials: StoreListItem[] };

/** Vitrines da loja (mais vendidos, lançamentos, em breve, promoções). Cache de 1 hora. */
export async function getStoreHighlights(): Promise<StoreHighlights | null> {
  try {
    const res = await fetch(`${STORE_API}/featuredcategories?cc=BR&l=portuguese`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    type Raw = {
      id: number;
      type: number;
      name: string;
      header_image?: string;
      large_capsule_image?: string;
      discount_percent?: number;
      final_price?: number;
      original_price?: number | null;
    };
    const body = (await res.json()) as Record<string, { items?: Raw[] }>;
    const map = (items: Raw[] = []) => {
      const seen = new Set<number>();
      return items
        .filter((i) => i.type === 0 && !seen.has(i.id) && seen.add(i.id))
        .map((i) => ({
          appId: i.id,
          name: i.name,
          image: i.header_image ?? i.large_capsule_image ?? "",
          discountPercent: i.discount_percent ?? 0,
          finalPrice: i.final_price || null,
          originalPrice: i.original_price ?? null,
        }));
    };
    return {
      topSellers: map(body.top_sellers?.items),
      newReleases: map(body.new_releases?.items).slice(0, 12),
      comingSoon: map(body.coming_soon?.items),
      specials: map(body.specials?.items),
    };
  } catch {
    return null;
  }
}

export type SteamNewsItem = { title: string; url: string; date: Date; feed: string; excerpt: string };

/** Notícias e patch notes de um jogo (anúncios oficiais primeiro). Cache de 1 hora. */
export async function getGameNews(appId: number, count = 4): Promise<SteamNewsItem[]> {
  try {
    const res = await fetch(
      `${STEAM_API}/ISteamNews/GetNewsForApp/v2/?appid=${appId}&count=${count * 3}&maxlength=240&format=json`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      appnews?: { newsitems?: { title: string; url: string; date: number; feedlabel: string; feedname: string; contents: string }[] };
    };
    const items = body.appnews?.newsitems ?? [];
    // Prefere os anúncios oficiais; completa com notícias de sites
    const official = items.filter((n) => n.feedname === "steam_community_announcements");
    const rest = items.filter((n) => n.feedname !== "steam_community_announcements");
    return [...official, ...rest].slice(0, count).map((n) => ({
      title: n.title,
      url: n.url,
      date: new Date(n.date * 1000),
      feed: n.feedname === "steam_community_announcements" ? "Anúncio oficial" : n.feedlabel,
      excerpt: n.contents
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    }));
  } catch {
    return [];
  }
}

// URLs de imagem ficam em ./assets (usadas também no client)
export { steamCoverUrl, steamHeaderUrl } from "./assets";
