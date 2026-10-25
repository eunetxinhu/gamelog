"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { LogStatus } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { recordActivity } from "@/lib/activity";
import { resolveSteamCovers } from "@/lib/catalog";
import {
  getOwnedGames,
  getPlayerAchievements,
  getPlayerSummary,
  getRecentlyPlayedGames,
  steamCoverUrl,
  type AchievementProgress,
  type SteamFetchError,
  type SteamOwnedGame,
} from "@/lib/steam/api";
import type { SteamSyncError, SteamSyncResult } from "./types";

/** Intervalo mínimo entre sincronizações do mesmo usuário. */
const SYNC_COOLDOWN_SECONDS = 5 * 60;
/** Quantos jogos têm as conquistas checadas por sincronização. */
const ACHIEVEMENT_CHECKS_PER_SYNC = 20;
/** Jogos com menos conquistas que isso não contam como platina (ex.: CS2 tem 1). */
const MIN_ACHIEVEMENTS_FOR_PLATINUM = 5;
/** Platinas mais antigas que isso entram no perfil, mas não viram publicação no feed. */
const PLATINUM_POST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const fail = (error: SteamSyncError): SteamSyncResult => ({ ok: false, error });

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

/**
 * Sincroniza a biblioteca Steam do usuário logado.
 *
 * Não recebe nenhum SteamID do navegador: usa só o `steamId` salvo pelo
 * "Entrar com Steam" (src/app/api/steam/callback). Assim ninguém sincroniza a
 * biblioteca de uma conta que não é dele.
 *
 * Nunca lança para erros esperados: devolve `{ ok: false, error: { code } }`
 * para a UI decidir o que mostrar. Em especial, perfil com "Detalhes dos jogos"
 * privados → `STEAM_PRIVATE` (a Steam responde 200 com `response: {}`).
 */
export async function syncSteamLibrary(): Promise<SteamSyncResult> {
  try {
    // 1) Autenticação -----------------------------------------------------------
    const user = await getCurrentUser();
    if (!user) return fail({ code: "UNAUTHENTICATED", message: "Faça login para sincronizar sua Steam." });

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
    // (Biblioteca realmente vazia vem como `{ game_count: 0 }`.)
    if (owned.games === undefined && owned.game_count !== 0) {
      const profileIsPrivate = summary.communityvisibilitystate !== 3;
      return fail({
        code: "STEAM_PRIVATE",
        privacyReason: profileIsPrivate ? "PROFILE" : "GAME_DETAILS",
        message: profileIsPrivate
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
      where: { userId: user.id, source: "STEAM" },
      select: { playtimeMinutes: true, platinumAt: true, achievementsCheckedAt: true, game: { select: { steamAppId: true } } },
    });
    const prevByApp = new Map(previous.map((p) => [p.game.steamAppId!, p]));

    // 7) Conquistas (fora da transação: são chamadas de rede) -------------------
    // Até ACHIEVEMENT_CHECKS_PER_SYNC jogos por vez: primeiro os jogados nas últimas
    // 2 semanas, depois os nunca checados. A biblioteca inteira é coberta em algumas sincronizações.
    const candidates = games
      .filter((g) => (g.playtime_forever ?? 0) > 0 && !prevByApp.get(g.appid)?.platinumAt)
      .map((g) => ({ g, recent: minutes2w(g) > 0, checked: Boolean(prevByApp.get(g.appid)?.achievementsCheckedAt) }))
      .filter((c) => c.recent || !c.checked)
      .sort((a, b) => Number(b.recent) - Number(a.recent) || b.g.playtime_forever - a.g.playtime_forever)
      .slice(0, ACHIEVEMENT_CHECKS_PER_SYNC);

    const achievements = new Map<number, AchievementProgress | null>();
    for (let i = 0; i < candidates.length; i += 5) {
      const batch = candidates.slice(i, i + 5);
      const results = await Promise.all(batch.map((c) => getPlayerAchievements(steamId, c.g.appid)));
      batch.forEach((c, j) => achievements.set(c.g.appid, results[j]));
    }

    // 8) Persistência -----------------------------------------------------------
    const syncedAt = new Date();
    const appIds = games.map((g) => g.appid);

    const { newGames, updatedGames, removedGames, posted } = await prisma.$transaction(
      async (tx) => {
        // 8a) Garante uma linha em `games` para cada appid (idempotente)
        if (games.length > 0) {
          await tx.game.createMany({
            data: games.map((g) => ({
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

        // 8b) Upsert em lote da biblioteca (1 query, mesmo com milhares de jogos)
        const rows = games
          .filter((g) => gameIdByApp.has(g.appid))
          .map((g) => ({
            gameId: gameIdByApp.get(g.appid)!,
            minutes: g.playtime_forever ?? 0,
            minutes2w: minutes2w(g),
            lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
          }));

        let inserted = 0;
        let updated = 0;
        if (rows.length > 0) {
          const result = await tx.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
            INSERT INTO library_entries
              (user_id, game_id, source, playtime_minutes, playtime_2weeks_minutes, last_played_at, imported_at, updated_at)
            SELECT ${user.id}::uuid, t.game_id, 'STEAM'::"LibrarySource", t.minutes, t.minutes_2w,
                   (t.last_played AT TIME ZONE 'UTC'), now(), now()
            FROM unnest(
              ${rows.map((r) => r.gameId)}::text[],
              ${rows.map((r) => r.minutes)}::int[],
              ${rows.map((r) => r.minutes2w)}::int[],
              ${rows.map((r) => r.lastPlayed)}::timestamptz[]
            ) AS t(game_id, minutes, minutes_2w, last_played)
            ON CONFLICT (user_id, game_id) DO UPDATE SET
              source                  = 'STEAM'::"LibrarySource",
              playtime_minutes        = EXCLUDED.playtime_minutes,
              playtime_2weeks_minutes = EXCLUDED.playtime_2weeks_minutes,
              last_played_at          = EXCLUDED.last_played_at,
              updated_at              = now()
            RETURNING (xmax = 0) AS inserted
          `);
          inserted = result.filter((r) => r.inserted).length;
          updated = result.length - inserted;
        }

        // 8c) Remove o que saiu da biblioteca (reembolso, Family Sharing etc.)
        const removed = await tx.libraryEntry.deleteMany({
          where: { userId: user.id, source: "STEAM", gameId: { notIn: rows.map((r) => r.gameId) } },
        });

        // 8d) Conquistas + platinas → publicação no feed (só platinas recentes)
        let platinums = 0;
        for (const [appId, progress] of achievements) {
          const gameId = gameIdByApp.get(appId);
          if (!gameId) continue;
          const isPlatinum =
            progress !== null && progress.total >= MIN_ACHIEVEMENTS_FOR_PLATINUM && progress.unlocked === progress.total;
          const platinumAt = isPlatinum ? (progress.lastUnlockAt ?? syncedAt) : null;

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
          for (const g of games) {
            const gameId = gameIdByApp.get(g.appid);
            const before = prevByApp.get(g.appid)?.playtimeMinutes ?? 0;
            if (!gameId || before > 0 || (g.playtime_forever ?? 0) === 0) continue;
            await setLogStatus(tx, user.id, gameId, "PLAYING", { onlyIfMissing: true });
            if (await recordActivity(tx, { userId: user.id, gameId, type: "STARTED_GAME", source: "STEAM" })) started++;
          }
        }

        await tx.user.update({ where: { id: user.id }, data: { steamLastSyncAt: syncedAt } });

        return {
          newGames: inserted,
          updatedGames: updated,
          removedGames: removed.count,
          posted: { platinums, started },
        };
      },
      { timeout: 30_000 },
    );

    // Capas com o caminho real (jogos novos não têm a URL fixa). Não derruba a sincronização.
    await resolveSteamCovers(appIds).catch((err) => console.error("[steam] capas", err));

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

/** Desvincula a Steam e remove os jogos importados dela (logs/reviews ficam). */
export async function unlinkSteam(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await prisma.$transaction([
    prisma.libraryEntry.deleteMany({ where: { userId: user.id, source: "STEAM" } }),
    prisma.user.update({
      where: { id: user.id },
      data: { steamId: null, steamPersonaName: null, steamAvatarUrl: null, steamLastSyncAt: null },
    }),
  ]);

  revalidatePath(`/u/${user.username}`);
  revalidatePath("/settings/profile");
  return { ok: true };
}
