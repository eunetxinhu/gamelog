import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { lookupRawgPlaytime } from "@/lib/catalog";
import { pickEstimate, sumEstimates, type CommunityTimes, type Estimate } from "@/lib/time-to-beat-calc";

/**
 * "Tempo para zerar". Duas fontes, sem raspar sites de terceiros:
 *  1. Comunidade GameLog: mediana das horas na Steam de quem finalizou ou platinou
 *     (status do GameLog ou platina detectada). É a fonte preferida.
 *  2. RAWG: média de horas jogadas na Steam (todos os jogadores, não só quem terminou),
 *     usada enquanto a comunidade não tem amostra suficiente.
 */

/** RAWG muda pouco: confere de novo a cada 30 dias. */
const RAWG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Medianas da comunidade para vários jogos de uma vez (1 query). */
export async function getCommunityTimes(gameIds: string[]): Promise<Map<string, CommunityTimes>> {
  if (gameIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    { game_id: string; finish_median: number | null; finish_n: bigint; platinum_median: number | null; platinum_n: bigint }[]
  >`
    SELECT le.game_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY le.playtime_minutes)
             FILTER (WHERE gl.status IN ('COMPLETED', 'PLATINUM') OR le.platinum_at IS NOT NULL) AS finish_median,
           count(*) FILTER (WHERE gl.status IN ('COMPLETED', 'PLATINUM') OR le.platinum_at IS NOT NULL) AS finish_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY le.playtime_minutes)
             FILTER (WHERE gl.status = 'PLATINUM' OR le.platinum_at IS NOT NULL) AS platinum_median,
           count(*) FILTER (WHERE gl.status = 'PLATINUM' OR le.platinum_at IS NOT NULL) AS platinum_n
    FROM library_entries le
    LEFT JOIN game_logs gl ON gl.user_id = le.user_id AND gl.game_id = le.game_id
    WHERE le.game_id = ANY(${gameIds}::text[]) AND le.playtime_minutes > 0
    GROUP BY le.game_id`;
  return new Map(
    rows.map((r) => [
      r.game_id,
      {
        finishMedian: r.finish_median === null ? null : Number(r.finish_median),
        finishCount: Number(r.finish_n),
        platinumMedian: r.platinum_median === null ? null : Number(r.platinum_median),
        platinumCount: Number(r.platinum_n),
      },
    ]),
  );
}

export type GameTimes = { community: CommunityTimes | null; rawgHours: number | null; estimate: Estimate | null };

/** Para a página do jogo. */
export async function getGameTimes(game: { id: string; rawgPlaytimeHours: number | null }): Promise<GameTimes> {
  const community = (await getCommunityTimes([game.id])).get(game.id) ?? null;
  return { community, rawgHours: game.rawgPlaytimeHours, estimate: pickEstimate(community ?? undefined, game.rawgPlaytimeHours) };
}

/** Busca a média da RAWG se ainda não foi conferida (ou se venceu). Nunca lança. */
export async function ensureRawgPlaytime(game: {
  id: string;
  title: string;
  rawgId: number | null;
  rawgPlaytimeCheckedAt: Date | null;
}): Promise<void> {
  if (game.rawgPlaytimeCheckedAt && Date.now() - game.rawgPlaytimeCheckedAt.getTime() < RAWG_TTL_MS) return;
  try {
    const hours = await lookupRawgPlaytime(game);
    if (hours === undefined) return; // RAWG fora: tenta na próxima
    await prisma.game.update({
      where: { id: game.id },
      data: { rawgPlaytimeHours: hours ? Math.min(hours, 32767) : null, rawgPlaytimeCheckedAt: new Date() },
    });
  } catch (err) {
    console.error("[tempo para zerar] rawg", err);
  }
}

/** Estimativa de cada jogo do backlog e o total (`cache`: a aba e o cabeçalho usam no mesmo request). */
export const getBacklogEstimates = cache(async (userId: string) => {
  const logs = await prisma.gameLog.findMany({
    where: { userId, status: "BACKLOG" },
    select: { game: { select: { id: true, rawgPlaytimeHours: true } } },
  });
  const community = await getCommunityTimes(logs.map((l) => l.game.id));
  const byGame = new Map(logs.map((l) => [l.game.id, pickEstimate(community.get(l.game.id), l.game.rawgPlaytimeHours)]));
  return { byGame, ...sumEstimates([...byGame.values()]) };
});

/**
 * Cron diário: preenche a média da RAWG dos jogos que estão em algum backlog ou
 * "jogando" e ainda não foram conferidos. Poucos por vez (plano grátis da RAWG).
 */
export async function backfillRawgPlaytime(limit = 30) {
  if (!process.env.RAWG_API_KEY) return { checked: 0 };
  const games = await prisma.game.findMany({
    where: {
      OR: [{ rawgPlaytimeCheckedAt: null }, { rawgPlaytimeCheckedAt: { lt: new Date(Date.now() - RAWG_TTL_MS) } }],
      logs: { some: { status: { in: ["BACKLOG", "PLAYING"] } } },
    },
    orderBy: { rawgPlaytimeCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, title: true, rawgId: true, rawgPlaytimeCheckedAt: true },
  });
  for (const g of games) await ensureRawgPlaytime(g);
  return { checked: games.length };
}
