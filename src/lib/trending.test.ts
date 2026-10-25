import { describe, expect, it } from "vitest";
import { rankForYou, trendScore } from "./trending";

describe("aba Para você", () => {
  it("mais engajamento sobe; mais velho desce", () => {
    const base = { reactions: 2, comments: 0, hasContent: false, ageHours: 5 };
    expect(trendScore({ ...base, comments: 1 })).toBeGreaterThan(trendScore(base));
    expect(trendScore({ ...base, ageHours: 48 })).toBeLessThan(trendScore(base));
    expect(trendScore({ ...base, hasContent: true })).toBeGreaterThan(trendScore(base));
  });

  it("conversa de ontem passa na frente de review nova sem interação", () => {
    const ontem = trendScore({ reactions: 3, comments: 2, hasContent: false, ageHours: 20 });
    const nova = trendScore({ reactions: 0, comments: 0, hasContent: true, ageHours: 1 });
    expect(ontem).toBeGreaterThan(nova);
  });

  it("publicação nova sem curtidas ainda aparece (pontuação maior que zero)", () => {
    expect(trendScore({ reactions: 0, comments: 0, hasContent: false, ageHours: 0 })).toBeGreaterThan(0);
  });

  it("no máximo 2 por pessoa antes das outras", () => {
    const items = [
      { id: "a1", userId: "a", score: 10 },
      { id: "a2", userId: "a", score: 9 },
      { id: "a3", userId: "a", score: 8 },
      { id: "b1", userId: "b", score: 1 },
    ];
    expect(rankForYou(items).map((i) => i.id)).toEqual(["a1", "a2", "b1", "a3"]);
  });
});
