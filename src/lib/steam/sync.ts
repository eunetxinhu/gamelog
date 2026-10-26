import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { LogStatus, SyncStep } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { recordActivity } from "@/lib/activity";
import { resolveSteamCovers } from "@/lib/catalog";
import { ensurePlatinumRarity } from "@/lib/rarity";
import {
  getAchievementDetails,
  getOwnedGames,
  getPlayerAchievements,
  getPlayerSummary,
  getRecentlyPlayedGames,
  getSteamWishlist,
  getStoreNames,
  steamCoverUrl,
  type AchievementCheck,
  type SteamFetchError,
  type SteamOwnedGame,
} from "@/lib/steam/api";
import type { SteamSyncError } from "@/app/(app)/settings/profile/_actions/types";
import { detectSteamPrivacy } from "@/lib/steam/privacy";
import { nextSyncAt } from "@/lib/steam/schedule";
import { ACHIEVEMENT_CONCURRENCY, achievementQueue, playtimeHidden } from "@/lib/steam/achievement-queue";
import {
  ACHIEVEMENT_CHUNK,
  chunk,
  wishlistDiff,
  type AchievementsResult,
  type LibraryResult,
  type RareResult,
  type SyncSummary,
  type WishlistResult,
} from "@/lib/jobs/sync-plan";

// =============================================================================
//  Etapas da sincronização da Steam. Cada função é uma tarefa da fila
//  (src/lib/jobs/queue.ts): roda sozinha, em qualquer worker, e devolve o
//  resultado + as próximas tarefas. Nenhuma depende de estado em memória.
// =============================================================================

/** Jogos com menos conquistas que isso não contam como platina (ex.: CS2 tem 1). */
export const MIN_ACHIEVEMENTS_FOR_PLATINUM = 5;
/** Conquista abaixo disso (% de jogadores) vira publicação "conquista rara". */
const RARE_ACHIEVEMENT_PERCENT = 1;
/** Jogos recentes conferidos por sincronização atrás de conquistas raras (lista completa = mais chamadas). */
const RARE_CHECKS_PER_SYNC = 5;
/** Sem checagem anterior, olha as conquistas desbloqueadas nesse período. */
const RARE_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
/** Platinas mais antigas que isso entram no perfil, mas não viram publicação no feed. */
const PLATINUM_POST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Ainda tem jogo para conferir: a próxima sincronização do cron vem logo. */
const BACKLOG_RESYNC_MS = 15 * 60 * 1000;

export type SyncUser = Pick<User, "id" | "username" | "steamId" | "steamLastSyncAt" | "lastSeenAt">;

export type NewTask = { step: SyncStep; payload?: Prisma.InputJsonValue };

/** O que uma etapa devolve para a fila. */
export type StepOutcome =
  | { kind: "ok"; result: Prisma.InputJsonValue | null; next?: NewTask[] }
  /** Etapa sem o que fazer (ex.: wishlist privada) */
  | { kind: "skipped"; result?: Prisma.InputJsonValue | null }
  /** Erro que não adianta repetir: o job inteiro falha com esta mensagem */
  | { kind: "fatal"; error: SteamSyncError }
  /** Falha passageira da Steam: a fila tenta de novo com espera */
  | { kind: "retry"; message: string; error?: SteamSyncError };

const fatal = (error: SteamSyncError): StepOutcome => ({ kind: "fatal", error });

function fromFetchError(e: SteamFetchError): StepOutcome {
  switch (e.kind) {
    case "RATE_LIMITED":
      return { kind: "retry", message: "Steam limitando", error: { code: "STEAM_RATE_LIMITED", message: "A Steam está limitando as requisições. Tente de novo em alguns minutos." } };
    case "BAD_API_KEY":
      console.error("[steam] STEAM_API_KEY inválida ou revogada");
      return { kind: "retry", message: "chave da Steam", error: { code: "STEAM_UNAVAILABLE", message: "Não foi possível falar com a Steam agora." } };
    default:
      return { kind: "retry", message: "Steam fora", error: { code: "STEAM_UNAVAILABLE", message: "A Steam não respondeu. Tente novamente em instantes." } };
  }
}

/**
 * Upsert em lote em library_entries. Para FAMILY as horas nunca diminuem: jogos
 * registrados só pelo site chegam com 0 minutos (a Steam não informa) e não podem
 * apagar as horas vistas antes nos "jogados recentemente".
 */
async function upsertLibrary(
  tx: Prisma.TransactionClient,
  userId: string,
  source: "STEAM" | "FAMILY",
  rows: { gameId: string; minutes: number; minutes2w: number; lastPlayed: string | null }[],
) {
  if (rows.length === 0) return [];
  return tx.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
    INSERT INTO library_entries
      (user_id, game_id, source, playtime_minutes, playtime_2weeks_minutes, last_played_at, imported_at, updated_at)
    SELECT ${userId}::uuid, t.game_id, ${source}::"LibrarySource", t.minutes, t.minutes_2w,
           (t.last_played AT TIME ZONE 'UTC'), now(), now()
    FROM unnest(
      ${rows.map((r) => r.gameId)}::text[],
      ${rows.map((r) => r.minutes)}::int[],
      ${rows.map((r) => r.minutes2w)}::int[],
      ${rows.map((r) => r.lastPlayed)}::timestamptz[]
    ) AS t(game_id, minutes, minutes_2w, last_played)
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      source                  = EXCLUDED.source,
      playtime_minutes        = CASE WHEN EXCLUDED.source = 'FAMILY'
                                     THEN GREATEST(library_entries.playtime_minutes, EXCLUDED.playtime_minutes)
                                     ELSE EXCLUDED.playtime_minutes END,
      playtime_2weeks_minutes = EXCLUDED.playtime_2weeks_minutes,
      last_played_at          = COALESCE(EXCLUDED.last_played_at, library_entries.last_played_at),
      updated_at              = now()
    RETURNING (xmax = 0) AS inserted
  `);
}

/** Atualiza o status do registro sem mexer em nota/review. */
async function setLogStatus(tx: Prisma.TransactionClient, userId: string, gameId: string, status: LogStatus, opts: { onlyIfMissing?: boolean } = {}) {
  await tx.gameLog.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, status },
    update: opts.onlyIfMissing ? {} : { status },
  });
}

/** Garante uma linha em `games` para cada appid (idempotente) e devolve appid → id. */
async function ensureGames(db: Prisma.TransactionClient, games: { appid: number; name?: string }[]) {
  if (games.length === 0) return new Map<number, string>();
  await db.game.createMany({
    data: games.map((g) => ({ slug: `steam-${g.appid}`, title: g.name?.trim() || `Steam App ${g.appid}`, steamAppId: g.appid, coverUrl: steamCoverUrl(g.appid) })),
    skipDuplicates: true,
  });
  const rows = await db.game.findMany({ where: { steamAppId: { in: games.map((g) => g.appid) } }, select: { id: true, steamAppId: true } });
  return new Map(rows.map((r) => [r.steamAppId!, r.id]));
}

// -----------------------------------------------------------------------------
//  1) Biblioteca: perfil, jogos, horas, Família Steam, "começou a jogar".
//     Monta a fila de conquistas e cria as tarefas seguintes.
// -----------------------------------------------------------------------------

export async function stepLibrary(user: SyncUser): Promise<StepOutcome> {
  const steamId = user.steamId;
  if (!steamId) return fatal({ code: "STEAM_NOT_LINKED", message: "Entre com a Steam para vincular sua conta." });

  // Perfil existe? (também diz o nível de visibilidade)
  const summaryRes = await getPlayerSummary(steamId);
  if (!summaryRes.ok) return fromFetchError(summaryRes.error);
  const summary = summaryRes.data;
  if (!summary) return fatal({ code: "STEAM_NOT_FOUND", message: "Esse SteamID não corresponde a nenhum perfil." });

  // Nome e avatar já aqui, para aparecerem mesmo se o perfil estiver privado
  await prisma.user.update({ where: { id: user.id }, data: { steamPersonaName: summary.personaname, steamAvatarUrl: summary.avatarfull } });

  const [ownedRes, recentRes] = await Promise.all([getOwnedGames(steamId), getRecentlyPlayedGames(steamId)]);
  if (!ownedRes.ok) return fromFetchError(ownedRes.error);
  const owned = ownedRes.data;

  // >>> REGRA DE PRIVACIDADE <<< "Detalhes dos jogos" privados: a Steam devolve 200 OK
  // com `{ response: {} }` (ver lib/steam/privacy.ts). Não é erro de rede: é configuração.
  const privacy = detectSteamPrivacy(owned, summary.communityvisibilitystate);
  if (privacy.private) {
    return fatal({
      code: "STEAM_PRIVATE",
      privacyReason: privacy.reason,
      message:
        privacy.reason === "PROFILE"
          ? "Seu perfil Steam está privado, então não conseguimos ver seus jogos."
          : 'Seu perfil Steam é público, mas os "Detalhes dos jogos" estão privados.',
    });
  }

  const games = owned.games ?? [];
  const recentByApp = new Map<number, number>();
  if (recentRes.ok) for (const g of recentRes.data.games ?? []) recentByApp.set(g.appid, g.playtime_2weeks);
  const minutes2w = (g: SteamOwnedGame) => Math.max(g.playtime_2weeks ?? 0, recentByApp.get(g.appid) ?? 0);

  // Estado anterior: base para "começou a jogar" e para a fila de conquistas.
  // Primeira sincronização não publica "começou a jogar" (seriam centenas de jogos antigos).
  const firstSync = !user.steamLastSyncAt;
  const previous = await prisma.libraryEntry.findMany({
    where: { userId: user.id, source: { in: ["STEAM", "FAMILY"] } },
    select: { source: true, playtimeMinutes: true, platinumAt: true, achievementsCheckedAt: true, game: { select: { steamAppId: true, title: true } } },
  });
  const prevByApp = new Map(previous.map((p) => [p.game.steamAppId!, p]));

  // Família Steam: jogos emprestados não vêm no GetOwnedGames. Entram pelos "jogados
  // recentemente" que não são dele, pelos registrados no site (menos Quero jogar) e
  // pelos que já estavam salvos como FAMILY.
  const ownedIds = new Set(games.map((g) => g.appid));
  const familyByApp = new Map<number, SteamOwnedGame>();
  for (const p of previous) {
    if (p.source === "FAMILY" && !ownedIds.has(p.game.steamAppId!)) {
      familyByApp.set(p.game.steamAppId!, { appid: p.game.steamAppId!, name: p.game.title, playtime_forever: p.playtimeMinutes });
    }
  }
  const loggedSteamGames = await prisma.gameLog.findMany({
    where: { userId: user.id, status: { not: "BACKLOG" }, game: { steamAppId: { not: null } } },
    select: { game: { select: { steamAppId: true, title: true } } },
  });
  for (const { game } of loggedSteamGames) {
    const appid = game.steamAppId!;
    if (!ownedIds.has(appid) && !familyByApp.has(appid)) {
      familyByApp.set(appid, { appid, name: game.title, playtime_forever: prevByApp.get(appid)?.playtimeMinutes ?? 0 });
    }
  }
  if (recentRes.ok) {
    for (const g of recentRes.data.games ?? []) {
      if (!ownedIds.has(g.appid)) familyByApp.set(g.appid, { appid: g.appid, name: g.name, playtime_forever: g.playtime_forever, playtime_2weeks: g.playtime_2weeks });
    }
  }
  const family = [...familyByApp.values()];
  const familyIds = new Set(familyByApp.keys());
  const allGames = [...games, ...family];

  // Fila de conquistas (ver lib/steam/achievement-queue.ts): vira tarefas em lotes paralelos
  const hiddenPlaytime = playtimeHidden(games);
  const { queue, pending } = achievementQueue({ games: allGames, familyIds, prev: prevByApp, minutes2w, hiddenPlaytime });

  const { inserted, updated, removed, started } = await prisma.$transaction(
    async (tx) => {
      const gameIdByApp = await ensureGames(tx, allGames);
      const toRows = (list: SteamOwnedGame[]) =>
        list
          .filter((g) => gameIdByApp.has(g.appid))
          .map((g) => ({
            gameId: gameIdByApp.get(g.appid)!,
            minutes: g.playtime_forever ?? 0,
            minutes2w: minutes2w(g),
            lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
          }));
      const rows = toRows(games);
      const ownedResult = await upsertLibrary(tx, user.id, "STEAM", rows);
      await upsertLibrary(tx, user.id, "FAMILY", toRows(family));

      // Saiu da biblioteca (reembolso etc.). Família fica: sair dos recentes não é perder acesso.
      const removed = await tx.libraryEntry.deleteMany({ where: { userId: user.id, source: "STEAM", gameId: { notIn: rows.map((r) => r.gameId) } } });
      // Comprou: sai da wishlist (wishlist é "quero comprar")
      if (rows.length) await tx.wishlistItem.deleteMany({ where: { userId: user.id, gameId: { in: rows.map((r) => r.gameId) } } });

      // Começou a jogar: passou de 0 para >0 minutos desde a última sincronização
      let started = 0;
      if (!firstSync) {
        for (const g of allGames) {
          const gameId = gameIdByApp.get(g.appid);
          const before = prevByApp.get(g.appid)?.playtimeMinutes ?? 0;
          if (!gameId || before > 0 || (g.playtime_forever ?? 0) === 0) continue;
          await setLogStatus(tx, user.id, gameId, "PLAYING", { onlyIfMissing: true });
          if (await recordActivity(tx, { userId: user.id, gameId, type: "STARTED_GAME", source: "STEAM" })) started++;
        }
      }
      const inserted = ownedResult.filter((r) => r.inserted).length;
      return { inserted, updated: ownedResult.length - inserted, removed: removed.count, started };
    },
    { timeout: 30_000 },
  );

  const now = Date.now();
  const totalMinutes = games.reduce((acc, g) => acc + (g.playtime_forever ?? 0), 0);
  const result: LibraryResult = {
    steamId,
    personaName: summary.personaname,
    avatarUrl: summary.avatarfull,
    totalGames: games.length,
    newGames: inserted,
    updatedGames: updated,
    removedGames: removed,
    totalHours: Math.round(totalMinutes / 60),
    recentlyPlayed: games
      .map((g) => ({ g, m2w: minutes2w(g) }))
      .filter(({ m2w }) => m2w > 0)
      .sort((a, b) => b.m2w - a.m2w)
      .slice(0, 5)
      .map(({ g, m2w }) => ({ appId: g.appid, name: g.name ?? `App ${g.appid}`, hours2Weeks: Math.round((m2w / 60) * 10) / 10 })),
    started,
    playtimeHidden: hiddenPlaytime,
    minutesLast2Weeks: allGames.reduce((acc, g) => acc + minutes2w(g), 0),
    achievementsDeferred: pending,
  };

  // Próximas tarefas: lotes de conquistas em paralelo, raras dos recentes, wishlist, capas e o fechamento
  const rare = queue
    .filter((c) => c.recent)
    .slice(0, RARE_CHECKS_PER_SYNC)
    .map((c) => ({ appId: c.g.appid, since: (prevByApp.get(c.g.appid)?.achievementsCheckedAt ?? new Date(now - RARE_LOOKBACK_MS)).toISOString() }));
  const next: NewTask[] = [
    ...chunk(
      queue.map((c) => c.g.appid),
      ACHIEVEMENT_CHUNK,
    ).map((appIds) => ({ step: "ACHIEVEMENTS" as const, payload: { appIds } })),
    ...(rare.length ? [{ step: "RARE" as const, payload: { games: rare } }] : []),
    { step: "WISHLIST" },
    { step: "COVERS", payload: { appIds: allGames.map((g) => g.appid) } },
    { step: "FINALIZE" },
  ];
  return { kind: "ok", result: result as unknown as Prisma.InputJsonValue, next };
}

// -----------------------------------------------------------------------------
//  2) Conquistas de um lote de jogos: progresso, platina e publicação no feed
// -----------------------------------------------------------------------------

export async function stepAchievements(user: SyncUser, appIds: number[]): Promise<StepOutcome> {
  const steamId = user.steamId;
  if (!steamId) return { kind: "skipped" };

  const checks = new Map<number, AchievementCheck>();
  let retries = 0;
  for (let i = 0; i < appIds.length; i += ACHIEVEMENT_CONCURRENCY) {
    // Steam limitando: o que sobrou fica para a próxima sincronização (não marca como conferido)
    if (retries >= 3) break;
    const batch = appIds.slice(i, i + ACHIEVEMENT_CONCURRENCY);
    const results = await Promise.all(batch.map((id) => getPlayerAchievements(steamId, id)));
    batch.forEach((id, j) => checks.set(id, results[j]));
    retries += results.filter((r) => r.status === "retry").length;
  }

  const games = await prisma.game.findMany({ where: { steamAppId: { in: appIds } }, select: { id: true, steamAppId: true } });
  const gameIdByApp = new Map(games.map((g) => [g.steamAppId!, g.id]));
  const syncedAt = new Date();

  const { platinums, platinumGameIds, checked } = await prisma.$transaction(
    async (tx) => {
      let platinums = 0;
      let checked = 0;
      const platinumGameIds: string[] = [];
      for (const [appId, check] of checks) {
        const gameId = gameIdByApp.get(appId);
        // Falha da Steam: não marca como conferido, entra de novo na próxima
        if (!gameId || check.status !== "ok") continue;
        const progress = check.progress;
        const isPlatinum = progress !== null && progress.total >= MIN_ACHIEVEMENTS_FOR_PLATINUM && progress.unlocked === progress.total;
        const platinumAt = isPlatinum ? (progress.lastUnlockAt ?? syncedAt) : null;
        if (platinumAt) platinumGameIds.push(gameId);

        const res = await tx.libraryEntry.updateMany({
          where: { userId: user.id, gameId },
          data: { achievementsUnlocked: progress?.unlocked ?? null, achievementsTotal: progress?.total ?? null, achievementsCheckedAt: syncedAt, platinumAt },
        });
        if (res.count) checked++;

        if (platinumAt && syncedAt.getTime() - platinumAt.getTime() <= PLATINUM_POST_WINDOW_MS) {
          await setLogStatus(tx, user.id, gameId, "PLATINUM");
          if (await recordActivity(tx, { userId: user.id, gameId, type: "PLATINUM", source: "STEAM", createdAt: platinumAt })) platinums++;
        }
      }
      return { platinums, platinumGameIds, checked };
    },
    { timeout: 30_000 },
  );

  // Raridade das platinas (não derruba a etapa)
  if (platinumGameIds.length) {
    const rarityGames = await prisma.game.findMany({
      where: { id: { in: platinumGameIds } },
      select: { id: true, steamAppId: true, platinumRarity: true, platinumRarityCheckedAt: true },
    });
    await ensurePlatinumRarity(rarityGames).catch((err) => console.error("[steam] raridade", err));
  }

  const result: AchievementsResult = { checked, retry: Math.max(0, appIds.length - checked), platinums };
  return { kind: "ok", result };
}

// -----------------------------------------------------------------------------
//  3) Conquistas raras (< 1% dos jogadores) desbloqueadas desde a última checagem
// -----------------------------------------------------------------------------

export async function stepRare(user: SyncUser, games: { appId: number; since: string }[]): Promise<StepOutcome> {
  if (!user.steamId) return { kind: "skipped" };
  let posted = 0;
  for (const { appId, since } of games) {
    const list = await getAchievementDetails(appId, user.steamId);
    const rare = (list ?? []).filter((a) => a.achieved && a.unlockedAt && a.unlockedAt > new Date(since) && a.percent !== null && a.percent < RARE_ACHIEVEMENT_PERCENT);
    if (rare.length === 0) continue;
    const game = await prisma.game.findUnique({ where: { steamAppId: appId }, select: { id: true } });
    if (!game) continue;
    for (const a of rare) {
      const id = await recordActivity(prisma, {
        userId: user.id,
        gameId: game.id,
        type: "RARE_ACHIEVEMENT",
        source: "STEAM",
        createdAt: a.unlockedAt!,
        meta: { apiName: a.apiName, name: a.name, description: a.description, icon: a.icon, percent: a.percent },
      });
      if (id) posted++;
    }
  }
  const result: RareResult = { rare: posted };
  return { kind: "ok", result };
}

// -----------------------------------------------------------------------------
//  4) Capas com o caminho real (jogos novos não têm a URL fixa)
// -----------------------------------------------------------------------------

export async function stepCovers(appIds: number[]): Promise<StepOutcome> {
  await resolveSteamCovers(appIds);
  return { kind: "ok", result: null };
}

// -----------------------------------------------------------------------------
//  5) Wishlist da Steam → wishlist do site (sem o que a pessoa já tem)
// -----------------------------------------------------------------------------

export async function stepWishlist(user: SyncUser): Promise<StepOutcome> {
  if (!user.steamId) return { kind: "skipped" };
  const res = await getSteamWishlist(user.steamId);
  if (res.status === "retry") return { kind: "retry", message: "wishlist da Steam não respondeu" };
  if (res.status === "private") {
    const result: WishlistResult = { imported: 0, removed: 0, private: true };
    return { kind: "skipped", result };
  }

  const [ownedRows, existingRows] = await Promise.all([
    prisma.libraryEntry.findMany({ where: { userId: user.id, source: "STEAM", game: { steamAppId: { not: null } } }, select: { game: { select: { steamAppId: true } } } }),
    prisma.wishlistItem.findMany({ where: { userId: user.id, game: { steamAppId: { not: null } } }, select: { source: true, gameId: true, game: { select: { steamAppId: true } } } }),
  ]);
  const { add, remove } = wishlistDiff({
    steam: res.appIds,
    owned: ownedRows.map((r) => r.game.steamAppId!),
    existing: existingRows.map((e) => ({ appId: e.game.steamAppId!, source: e.source })),
  });

  // Jogos que o site ainda não conhece precisam de nome (a wishlist só traz o appid)
  const known = add.length ? await prisma.game.findMany({ where: { steamAppId: { in: add } }, select: { steamAppId: true } }) : [];
  const knownSet = new Set(known.map((k) => k.steamAppId));
  const unknown = add.filter((id) => !knownSet.has(id));
  const names = unknown.length ? await getStoreNames(unknown) : new Map<number, string>();

  await prisma.$transaction(async (tx) => {
    const gameIdByApp = await ensureGames(
      tx,
      add.map((appid) => ({ appid, name: names.get(appid) })),
    );
    if (add.length) {
      await tx.wishlistItem.createMany({
        data: add.flatMap((appid) => (gameIdByApp.has(appid) ? [{ userId: user.id, gameId: gameIdByApp.get(appid)!, source: "STEAM" as const }] : [])),
        skipDuplicates: true,
      });
    }
    if (remove.length) {
      const removeSet = new Set(remove);
      const removeIds = existingRows.filter((e) => removeSet.has(e.game.steamAppId!)).map((e) => e.gameId);
      await tx.wishlistItem.deleteMany({ where: { userId: user.id, source: "STEAM", gameId: { in: removeIds } } });
    }
  });
  if (unknown.length) await resolveSteamCovers(unknown).catch(() => {});

  const result: WishlistResult = { imported: add.length, removed: remove.length, private: false };
  return { kind: "ok", result };
}

// -----------------------------------------------------------------------------
//  6) Fechamento: agenda a próxima sincronização e atualiza as páginas
// -----------------------------------------------------------------------------

export async function stepFinalize(user: SyncUser, summary: SyncSummary | null, minutesLast2Weeks: number): Promise<StepOutcome> {
  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      steamLastSyncAt: now,
      // Ainda tem jogo para conferir conquistas: o cron volta logo; senão, conforme a atividade
      steamNextSyncAt:
        summary && summary.pendingAchievementChecks > 0
          ? new Date(now.getTime() + BACKLOG_RESYNC_MS)
          : nextSyncAt({ minutesLast2Weeks, lastSeenAt: user.lastSeenAt, now }),
    },
  });
  try {
    revalidatePath(`/u/${user.username}`);
    revalidatePath(`/u/${user.username}/jogos`);
    revalidatePath("/settings/profile");
    revalidatePath("/feed");
  } catch {
    // Fora de um request do Next (scripts/testes): não há cache para invalidar
  }
  return { kind: "ok", result: null };
}
