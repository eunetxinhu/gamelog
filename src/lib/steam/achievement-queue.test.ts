import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CHECKS_BACKLOG, ACHIEVEMENT_CHECKS_PER_SYNC, achievementQueue, playtimeHidden, type QueueGame, type QueuePrev } from "./achievement-queue";

const game = (appid: number, minutes: number, extra: Partial<QueueGame> = {}): QueueGame => ({ appid, playtime_forever: minutes, ...extra });
const run = (games: QueueGame[], opts: { prev?: Map<number, QueuePrev>; family?: number[]; hidden?: boolean } = {}) =>
  achievementQueue({
    games,
    familyIds: new Set(opts.family ?? []),
    prev: opts.prev ?? new Map(),
    minutes2w: (g) => g.playtime_2weeks ?? 0,
    hiddenPlaytime: opts.hidden ?? playtimeHidden(games),
  });

describe("playtimeHidden", () => {
  it("todos os jogos com 0 minutos = tempo oculto", () => {
    expect(playtimeHidden([game(1, 0), game(2, 0)])).toBe(true);
    expect(playtimeHidden([game(1, 0), game(2, 30)])).toBe(false);
    expect(playtimeHidden([])).toBe(false);
  });
});

describe("achievementQueue", () => {
  it("sem tempo oculto, só entra jogo com horas ou da família", () => {
    const { queue } = run([game(1, 0), game(2, 60), game(3, 0)], { family: [3] });
    expect(queue.map((c) => c.g.appid).sort()).toEqual([2, 3]);
  });

  it("com o tempo de jogo oculto, todos os jogos entram (antes nenhum entrava)", () => {
    const { queue } = run([game(1, 0, { rtime_last_played: 100 }), game(2, 0, { rtime_last_played: 900 }), game(3, 0)]);
    expect(queue.map((c) => c.g.appid)).toEqual([2, 1, 3]); // jogado mais recentemente primeiro
  });

  it("conta nova com muitos jogos confere até o limite maior e conta o que falta", () => {
    const games = Array.from({ length: 250 }, (_, i) => game(i + 1, 10 + i));
    const { queue, pending } = run(games);
    expect(queue).toHaveLength(ACHIEVEMENT_CHECKS_BACKLOG);
    expect(pending).toBe(250 - ACHIEVEMENT_CHECKS_BACKLOG);
    expect(queue[0].g.appid).toBe(250); // mais horas primeiro
  });

  it("biblioteca já conferida volta ao limite normal", () => {
    const checked = new Date("2026-10-01T00:00:00Z");
    const games = Array.from({ length: 60 }, (_, i) => game(i + 1, 10, { playtime_2weeks: 5 }));
    const prev = new Map(games.map((g) => [g.appid, { platinumAt: null, achievementsCheckedAt: checked }]));
    expect(run(games, { prev }).queue).toHaveLength(ACHIEVEMENT_CHECKS_PER_SYNC);
  });

  it("pula platinados e conferidos que não foram jogados de novo", () => {
    const checked = new Date("2026-10-01T00:00:00Z");
    const prev = new Map<number, QueuePrev>([
      [1, { platinumAt: new Date(), achievementsCheckedAt: checked }],
      [2, { platinumAt: null, achievementsCheckedAt: checked }],
      [3, { platinumAt: null, achievementsCheckedAt: checked }],
    ]);
    const after = Math.floor(checked.getTime() / 1000) + 3600;
    const { queue } = run([game(1, 60), game(2, 60), game(3, 60, { rtime_last_played: after }), game(4, 60)], { prev });
    expect(queue.map((c) => c.g.appid)).toEqual([3, 4]);
  });

  it("jogados nas últimas 2 semanas vêm primeiro", () => {
    const { queue } = run([game(1, 9000), game(2, 5, { playtime_2weeks: 5 })]);
    expect(queue[0].g.appid).toBe(2);
  });
});
