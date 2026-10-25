import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { LogStatus } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { recordActivity } from "@/lib/activity";
import { resolveSteamCovers } from "@/lib/catalog";
import { ensurePlatinumRarity } from "@/lib/rarity";
import {
  getOwnedGames,
  getAchievementDetails,
  getPlayerAchievements,
  getPlayerSummary,
  getRecentlyPlayedGames,
  steamCoverUrl,
  type AchievementProgress,
  type SteamFetchError,
  type SteamOwnedGame,
} from "@/lib/steam/api";
import type { SteamSyncError, SteamSyncResult } from "@/app/(app)/settings/profile/_actions/types";
import { detectSteamPrivacy } from "@/lib/steam/privacy";
import { nextSyncAt } from "@/lib/steam/schedule";

/** Intervalo mínimo entre sincronizações do mesmo usuário. */
const SYNC_COOLDOWN_SECONDS = 5 * 60;
/** Quantos jogos têm as conquistas checadas por sincronização. */
const ACHIEVEMENT_CHECKS_PER_SYNC = 20;
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

const fail = (error: SteamSyncError): SteamSyncResult => ({ ok: false, error });

/**
 * Upsert em lote em library_entries. Para FAMILY as horas nunca diminuem: jogos
 * registrados só pelo GameLog chegam com 0 minutos (a Steam não informa) e não podem
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

/** Atualiza o status do GameLog sem mexer em nota/review. */
async function setLogStatus(
  tx: Prisma.TransactionClient,
  userId: string,
  gameId: string,
  status: LogStatus,
  opts: { onlyIfMissing?: boolean } = {},
) {
  await tx.gameLog.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, status },
    update: opts.onlyIfMissing ? {} : { status },
  });
}

function fromFetchError(e: SteamFetchError): SteamSyncResult {
  switch (e.kind) {
    case "RATE_LIMITED":
      return fail({ code: "STEAM_RATE_LIMITED", message: "A Steam está limitando as requisições. Tente de novo em alguns minutos." });
    case "BAD_API_KEY":
      console.error("[steam] STEAM_API_KEY inválida ou revogada");
      return fail({ code: "STEAM_UNAVAILABLE", message: "Não foi possível falar com a Steam agora." });
    default:
      return fail({ code: "STEAM_UNAVAILABLE", message: "A Steam não respondeu. Tente novamente em instantes." });
  }
}

export type SyncUser = Pick<User, "id" | "username" | "steamId" | "steamLastSyncAt" | "lastSeenAt">;

/**
 * Sincroniza a biblioteca Steam de um usuário. Usada pelo botão / sincronização
 * automática (usuário logado) e pelo cron diário (todos os usuários).
 *
 * Usa só o `steamId` salvo pelo "Entrar com Steam" (src/app/api/steam/callback),
 * nunca um SteamID vindo do navegador.
 *
 * Nunca lança para erros esperados: devolve `{ ok: false, error: { code } }`
 * para a UI decidir o que mostrar. Em especial, perfil com "Detalhes dos jogos"
 * privados → `STEAM_PRIVATE` (a Steam responde 200 com `response: {}`).
 */
export async function syncSteamForUser(user: SyncUser): Promise<SteamSyncResult> {
  try {
    // 2) Conta vinculada pelo login oficial -------------------------------------
    const steamId = user.steamId;
    if (!steamId) return fail({ code: "STEAM_NOT_LINKED", message: "Entre com a Steam para vincular sua conta." });

    // 3) Cooldown ---------------------------------------------------------------
    if (user.steamLastSyncAt) {
      const elapsed = (Date.now() - user.steamLastSyncAt.getTime()) / 1000;
      if (elapsed < SYNC_COOLDOWN_SECONDS) {
        const retryAfterSeconds = Math.ceil(SYNC_COOLDOWN_SECONDS - elapsed);
        return fail({
          code: "SYNC_COOLDOWN",
          message: `Você sincronizou há pouco. Aguarde ${Math.ceil(retryAfterSeconds / 60)} min.`,
          retryAfterSeconds,
        });
      }
    }

    // 4) Perfil existe? (também nos diz o nível de visibilidade) ---------------
    const summaryRes = await getPlayerSummary(steamId);
    if (!summaryRes.ok) return fromFetchError(summaryRes.error);
    const summary = summaryRes.data;
    if (!summary) return fail({ code: "STEAM_NOT_FOUND", message: "Esse SteamID não corresponde a nenhum perfil." });

    // Atualiza nome e avatar já aqui, para aparecerem mesmo se o perfil estiver privado
    await prisma.user.update({
      where: { id: user.id },
      data: { steamPersonaName: summary.personaname, steamAvatarUrl: summary.avatarfull },
    });

    // 5) Biblioteca + jogados recentemente (em paralelo) -----------------------
    const [ownedRes, recentRes] = await Promise.all([getOwnedGames(steamId), getRecentlyPlayedGames(steamId)]);
    if (!ownedRes.ok) return fromFetchError(ownedRes.error);

    const owned = ownedRes.data;

    // 6) >>> REGRA DE PRIVACIDADE <<< ------------------------------------------
    // Perfil com "Detalhes dos jogos" privados: a Steam devolve 200 OK com
    // `{ "response": {} }` → `games` é undefined. Isso NÃO é erro de rede nem
    // biblioteca vazia; é configuração de privacidade e o usuário pode resolver.
    // (Biblioteca realmente vazia vem como `{ game_count: 0 }`. Ver lib/steam/privacy.ts)
    const privacy = detectSteamPrivacy(owned, summary.communityvisibilitystate);
    if (privacy.private) {
      return fail({
        code: "STEAM_PRIVATE",
        privacyReason: privacy.reason,
        message:
          privacy.reason === "PROFILE"
            ? "Seu perfil Steam está privado, então não conseguimos ver seus jogos."
            : "Seu perfil Steam é público, mas os \"Detalhes dos jogos\" estão privados.",
      });
    }

    const games = owned.games ?? [];

    // Jogados nas últimas 2 semanas (falha aqui não derruba a sincronização)
    const recentByApp = new Map<number, number>();
    if (recentRes.ok) {
      for (const g of recentRes.data.games ?? []) recentByApp.set(g.appid, g.playtime_2weeks);
    }
    const minutes2w = (g: SteamOwnedGame) => Math.max(g.playtime_2weeks ?? 0, recentByApp.get(g.appid) ?? 0);

    // Estado anterior da biblioteca: base para detectar jogo novo e platina.
    // Na primeira sincronização (ou depois de trocar de conta) não publica "começou a jogar":
    // seriam centenas de jogos antigos de uma vez.
    const firstSync = !user.steamLastSyncAt;
    const previous = await prisma.libraryEntry.findMany({
      where: { userId: user.id, source: { in: ["STEAM", "FAMILY"] } },
      select: {
        source: true,
        playtimeMinutes: true,
        platinumAt: true,
        achievementsCheckedAt: true,
        game: { select: { steamAppId: true, title: true } },
      },
    });
    const prevByApp = new Map(previous.map((p) => [p.game.steamAppId!, p]));

    // Família Steam: jogos emprestados não vêm no GetOwnedGames, e a Steam não lista
    // a biblioteca da família para apps de terceiros. Mas as conquistas de qualquer jogo
    // que o usuário jogou vêm normalmente. Então descobrimos esses jogos por:
    //  - "jogados recentemente" que não são dele
    //  - jogos que ele registrou no GameLog (página do jogo, menos Backlog) que não são dele
    //  - os que já estavam salvos como FAMILY
    const ownedIds = new Set(games.map((g) => g.appid));
    const familyByApp = new Map<number, SteamOwnedGame>();
    for (const p of previous) {
      if (p.source === "FAMILY" && !ownedIds.has(p.game.steamAppId!)) {
        familyByApp.set(p.game.steamAppId!, { appid: p.game.steamAppId!, name: p.game.title, playtime_forever: p.playtimeMinutes });
      }
    }
    const loggedSteamGames = await prisma.gameLog.findMany({
      // Backlog fica de fora: a pessoa ainda nem jogou
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
        if (!ownedIds.has(g.appid)) {
          familyByApp.set(g.appid, { appid: g.appid, name: g.name, playtime_forever: g.playtime_forever, playtime_2weeks: g.playtime_2weeks });
        }
      }
    }
    const family = [...familyByApp.values()];
    const familyIds = new Set(familyByApp.keys());
    const allGames = [...games, ...family];

    // 7) Conquistas (fora da transação: são chamadas de rede) -------------------
    // Até ACHIEVEMENT_CHECKS_PER_SYNC jogos por vez: primeiro os jogados nas últimas
    // 2 semanas, depois os nunca checados. A biblioteca inteira é coberta em algumas sincronizações.
    // Jogos da família entram mesmo sem horas conhecidas (o registro no GameLog já indica que jogou).
    // Também entra quem foi jogado depois da última checagem (ex.: ficou mais de 2 semanas sem sincronizar).
    const candidates = allGames
      .filter((g) => ((g.playtime_forever ?? 0) > 0 || familyIds.has(g.appid)) && !prevByApp.get(g.appid)?.platinumAt)
      .map((g) => {
        const checkedAt = prevByApp.get(g.appid)?.achievementsCheckedAt ?? null;
        return {
          g,
          recent: minutes2w(g) > 0,
          family: familyIds.has(g.appid),
          checked: Boolean(checkedAt),
          playedSinceCheck: Boolean(checkedAt && g.rtime_last_played && g.rtime_last_played * 1000 > checkedAt.getTime()),
        };
      })
      .filter((c) => c.recent || !c.checked || c.playedSinceCheck)
      .sort(
        (a, b) =>
          Number(b.recent) - Number(a.recent) ||
          Number(b.playedSinceCheck) - Number(a.playedSinceCheck) ||
          Number(b.family) - Number(a.family) ||
          b.g.playtime_forever - a.g.playtime_forever,
      )
      .slice(0, ACHIEVEMENT_CHECKS_PER_SYNC);

    const achievements = new Map<number, AchievementProgress | null>();
    for (let i = 0; i < candidates.length; i += 5) {
      const batch = candidates.slice(i, i + 5);
      const results = await Promise.all(batch.map((c) => getPlayerAchievements(steamId, c.g.appid)));
      batch.forEach((c, j) => achievements.set(c.g.appid, results[j]));
    }

    // 8) Persistência -----------------------------------------------------------
    const syncedAt = new Date();
    const appIds = allGames.map((g) => g.appid);

    const { newGames, updatedGames, removedGames, posted, platinumGameIds } = await prisma.$transaction(
      async (tx) => {
        // 8a) Garante uma linha em `games` para cada appid (idempotente)
        if (allGames.length > 0) {
          await tx.game.createMany({
            data: allGames.map((g) => ({
              slug: `steam-${g.appid}`,
              title: g.name?.trim() || `Steam App ${g.appid}`,
              steamAppId: g.appid,
              coverUrl: steamCoverUrl(g.appid),
            })),
            skipDuplicates: true,
          });
        }

        const gameRows = appIds.length
          ? await tx.game.findMany({ where: { steamAppId: { in: appIds } }, select: { id: true, steamAppId: true } })
          : [];
        const gameIdByApp = new Map(gameRows.map((r) => [r.steamAppId!, r.id]));

        // 8b) Upsert em lote da biblioteca (1 query por origem, mesmo com milhares de jogos)
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
        const inserted = ownedResult.filter((r) => r.inserted).length;
        const updated = ownedResult.length - inserted;

        // 8c) Remove o que saiu da biblioteca (reembolso etc.). Jogos da família ficam:
        // sair dos "jogados recentemente" não quer dizer que a pessoa perdeu acesso.
        const removed = await tx.libraryEntry.deleteMany({
          where: { userId: user.id, source: "STEAM", gameId: { notIn: rows.map((r) => r.gameId) } },
        });

        // 8d) Conquistas + platinas → publicação no feed (só platinas recentes)
        let platinums = 0;
        const platinumGameIds: string[] = [];
        for (const [appId, progress] of achievements) {
          const gameId = gameIdByApp.get(appId);
          if (!gameId) continue;
          const isPlatinum =
            progress !== null && progress.total >= MIN_ACHIEVEMENTS_FOR_PLATINUM && progress.unlocked === progress.total;
          const platinumAt = isPlatinum ? (progress.lastUnlockAt ?? syncedAt) : null;
          if (platinumAt) platinumGameIds.push(gameId);

          await tx.libraryEntry.update({
            where: { userId_gameId: { userId: user.id, gameId } },
            data: {
              achievementsUnlocked: progress?.unlocked ?? null,
              achievementsTotal: progress?.total ?? null,
              achievementsCheckedAt: syncedAt,
              platinumAt,
            },
          });

          if (platinumAt && syncedAt.getTime() - platinumAt.getTime() <= PLATINUM_POST_WINDOW_MS) {
            await setLogStatus(tx, user.id, gameId, "PLATINUM");
            if (await recordActivity(tx, { userId: user.id, gameId, type: "PLATINUM", source: "STEAM", createdAt: platinumAt })) {
              platinums++;
            }
          }
        }

        // 8e) Começou a jogar: o jogo passou de 0 para >0 minutos desde a última sincronização
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

        // Próxima sincronização do cron conforme a atividade (ver lib/steam/schedule.ts)
        const minutesLast2Weeks = allGames.reduce((acc, g) => acc + minutes2w(g), 0);
        await tx.user.update({
          where: { id: user.id },
          data: { steamLastSyncAt: syncedAt, steamNextSyncAt: nextSyncAt({ minutesLast2Weeks, lastSeenAt: user.lastSeenAt, now: syncedAt }) },
        });

        return {
          newGames: inserted,
          updatedGames: updated,
          removedGames: removed.count,
          posted: { platinums, started, rare: 0 },
          platinumGameIds,
        };
      },
      { timeout: 30_000 },
    );

    // Capas com o caminho real (jogos novos não têm a URL fixa) e raridade das platinas.
    // Nada disso derruba a sincronização.
    await resolveSteamCovers(appIds).catch((err) => console.error("[steam] capas", err));
    if (platinumGameIds.length > 0) {
      const rarityGames = await prisma.game.findMany({
        where: { id: { in: platinumGameIds } },
        select: { id: true, steamAppId: true, platinumRarity: true, platinumRarityCheckedAt: true },
      });
      await ensurePlatinumRarity(rarityGames).catch((err) => console.error("[steam] raridade", err));
    }

    // Conquistas raras (< 1% dos jogadores) desbloqueadas desde a última checagem
    const rare = await postRareAchievements(
      user.id,
      steamId,
      candidates.filter((c) => c.recent).slice(0, RARE_CHECKS_PER_SYNC).map((c) => ({
        appId: c.g.appid,
        since: prevByApp.get(c.g.appid)?.achievementsCheckedAt ?? new Date(syncedAt.getTime() - RARE_LOOKBACK_MS),
      })),
    ).catch((err) => {
      console.error("[steam] conquistas raras", err);
      return 0;
    });
    posted.rare = rare;

    // 9) Revalida as páginas que exibem estatísticas ----------------------------
    revalidatePath(`/u/${user.username}`);
    revalidatePath("/settings/profile");
    revalidatePath("/feed");

    const totalMinutes = games.reduce((acc, g) => acc + (g.playtime_forever ?? 0), 0);
    const recentlyPlayed = games
      .map((g) => ({ g, m2w: minutes2w(g) }))
      .filter(({ m2w }) => m2w > 0)
      .sort((a, b) => b.m2w - a.m2w)
      .slice(0, 5)
      .map(({ g, m2w }) => ({ appId: g.appid, name: g.name ?? `App ${g.appid}`, hours2Weeks: Math.round((m2w / 60) * 10) / 10 }));

    return {
      ok: true,
      data: {
        steamId,
        personaName: summary.personaname,
        avatarUrl: summary.avatarfull,
        totalGames: games.length,
        newGames,
        updatedGames,
        removedGames,
        totalHours: Math.round(totalMinutes / 60),
        recentlyPlayed,
        posted,
        syncedAt: syncedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[steam] sync falhou", err);
    return fail({ code: "UNKNOWN", message: "Algo deu errado ao sincronizar. Tente novamente." });
  }
}

/** Publica as conquistas raras desbloqueadas depois de `since` em cada jogo. Devolve quantas publicou. */
async function postRareAchievements(userId: string, steamId: string, games: { appId: number; since: Date }[]) {
  let posted = 0;
  for (const { appId, since } of games) {
    const list = await getAchievementDetails(appId, steamId);
    const rare = (list ?? []).filter(
      (a) => a.achieved && a.unlockedAt && a.unlockedAt > since && a.percent !== null && a.percent < RARE_ACHIEVEMENT_PERCENT,
    );
    if (rare.length === 0) continue;
    const game = await prisma.game.findUnique({ where: { steamAppId: appId }, select: { id: true } });
    if (!game) continue;
    for (const a of rare) {
      const id = await recordActivity(prisma, {
        userId,
        gameId: game.id,
        type: "RARE_ACHIEVEMENT",
        source: "STEAM",
        createdAt: a.unlockedAt!,
        meta: { apiName: a.apiName, name: a.name, description: a.description, icon: a.icon, percent: a.percent },
      });
      if (id) posted++;
    }
  }
  return posted;
}
