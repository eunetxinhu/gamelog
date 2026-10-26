// Fila de conferência de conquistas da sincronização Steam (sem rede: testável).

/** Jogos conferidos por sincronização normal. */
export const ACHIEVEMENT_CHECKS_PER_SYNC = 20;
/** Quando ainda tem muito jogo nunca conferido (conta nova, tempo de jogo oculto): confere mais de uma vez. */
export const ACHIEVEMENT_CHECKS_BACKLOG = 100;
/** Chamadas à Steam em paralelo. */
export const ACHIEVEMENT_CONCURRENCY = 10;

export type QueueGame = {
  appid: number;
  playtime_forever: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
};

export type QueuePrev = { platinumAt: Date | null; achievementsCheckedAt: Date | null };

export type QueueItem<G extends QueueGame> = {
  g: G;
  recent: boolean;
  family: boolean;
  checked: boolean;
  playedSinceCheck: boolean;
};

/**
 * Tempo de jogo oculto na Steam ("Sempre manter meu tempo total de jogo privado"):
 * a biblioteca vem inteira, mas com 0 minutos em todos os jogos.
 */
export function playtimeHidden(games: QueueGame[]): boolean {
  return games.length > 0 && games.every((g) => !g.playtime_forever);
}

/**
 * Quais jogos têm as conquistas conferidas nesta sincronização, em ordem:
 * jogados nas últimas 2 semanas → jogados depois da última conferência → família
 * → mais horas → jogados mais recentemente.
 *
 * Entra quem tem horas, é da família ou, com o tempo de jogo oculto, qualquer jogo
 * (sem as horas não dá para saber quais foram jogados). Platinados ficam de fora.
 * Com mais de `ACHIEVEMENT_CHECKS_PER_SYNC` jogos nunca conferidos, o limite sobe
 * para `ACHIEVEMENT_CHECKS_BACKLOG`.
 */
export function achievementQueue<G extends QueueGame>(input: {
  games: G[];
  familyIds: Set<number>;
  prev: Map<number, QueuePrev>;
  minutes2w: (g: G) => number;
  hiddenPlaytime: boolean;
}): { queue: QueueItem<G>[]; pending: number } {
  const all = input.games
    .filter((g) => ((g.playtime_forever ?? 0) > 0 || input.familyIds.has(g.appid) || input.hiddenPlaytime) && !input.prev.get(g.appid)?.platinumAt)
    .map((g) => {
      const checkedAt = input.prev.get(g.appid)?.achievementsCheckedAt ?? null;
      return {
        g,
        recent: input.minutes2w(g) > 0,
        family: input.familyIds.has(g.appid),
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
        (b.g.playtime_forever ?? 0) - (a.g.playtime_forever ?? 0) ||
        (b.g.rtime_last_played ?? 0) - (a.g.rtime_last_played ?? 0),
    );
  const neverChecked = all.filter((c) => !c.checked).length;
  const limit = neverChecked > ACHIEVEMENT_CHECKS_PER_SYNC ? ACHIEVEMENT_CHECKS_BACKLOG : ACHIEVEMENT_CHECKS_PER_SYNC;
  const queue = all.slice(0, limit);
  return { queue, pending: all.length - queue.length };
}
