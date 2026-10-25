import "server-only";

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
  const globalUrl = `${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appId}`;

  type Schema = {
    game?: { availableGameStats?: { achievements?: { name: string; displayName: string; description?: string; icon: string; icongray: string; hidden: number }[] } };
  };
  type Global = { achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } };

  try {
    const [schemaRes, globalRes, mine] = await Promise.all([
      fetch(schemaUrl, day),
      fetch(globalUrl, day),
      steamId ? getPlayerAchievementList(steamId, appId) : Promise.resolve(null),
    ]);
    if (!schemaRes.ok) return null;
    const schema = ((await schemaRes.json()) as Schema).game?.availableGameStats?.achievements;
    if (!schema?.length) return null;

    const global = globalRes.ok ? ((await globalRes.json()) as Global).achievementpercentages?.achievements ?? [] : [];
    const percentBy = new Map(global.map((g) => [g.name, Number(g.percent)]));

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

export type StoreAppDetails = {
  name: string;
  summary: string | null;
  genres: string[];
  platforms: string[];
  releaseDate: Date | null;
};

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
          release_date?: { date?: string };
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
      releaseDate: parseStoreDate(data.release_date?.date),
    };
  } catch {
    return null;
  }
}

const PT_MONTHS: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

/** A loja manda a data como texto localizado ("12 nov. 2015", "Nov 12, 2015"…). */
function parseStoreDate(text: string | undefined): Date | null {
  if (!text) return null;
  const pt = text.toLowerCase().match(/(\d{1,2})\s*(?:de\s*)?([a-zç]{3})[a-zç.]*\s*(?:de\s*)?(\d{4})/);
  if (pt && pt[2] in PT_MONTHS) return new Date(Date.UTC(Number(pt[3]), PT_MONTHS[pt[2]], Number(pt[1])));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// URLs de imagem ficam em ./assets (usadas também no client)
export { steamCoverUrl, steamHeaderUrl } from "./assets";
