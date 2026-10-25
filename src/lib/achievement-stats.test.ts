import { describe, expect, it } from "vitest";
import { achievementStats, completionPercent } from "./achievement-stats";

describe("completionPercent", () => {
  it("arredonda para baixo (99,6% não é 100%)", () => {
    expect(completionPercent(249, 250)).toBe(99);
    expect(completionPercent(250, 250)).toBe(100);
  });

  it("sem conquistas é 0 e nunca passa de 100", () => {
    expect(completionPercent(3, 0)).toBe(0);
    expect(completionPercent(null, null)).toBe(0);
    expect(completionPercent(12, 10)).toBe(100);
  });
});

describe("achievementStats", () => {
  it("calcula a taxa média só com os jogos começados", () => {
    const s = achievementStats([
      { unlocked: 10, total: 10 }, // 100%
      { unlocked: 5, total: 10 }, // 50%
      { unlocked: 0, total: 40 }, // não começado: fora da média
      { unlocked: null, total: null }, // sem conquistas: fora de tudo
    ]);
    expect(s).toEqual({ games: 3, started: 2, unlocked: 15, perfect: 1, avgCompletion: 75 });
  });

  it("biblioteca sem conquistas", () => {
    expect(achievementStats([])).toEqual({ games: 0, started: 0, unlocked: 0, perfect: 0, avgCompletion: 0 });
  });
});
