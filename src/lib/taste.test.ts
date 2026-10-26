import { describe, expect, it } from "vitest";
import { compatibility, compatibilityLabel, recommend, stricterThan, topGenres } from "./taste";

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe("compatibilidade", () => {
  it("precisa de 3 jogos em comum", () => {
    expect(compatibility(m({ a: 5, b: 4 }), m({ a: 5, b: 4 }))).toBeNull();
  });

  it("notas iguais dão alto, opostas dão baixo, e poucos jogos puxam para 50%", () => {
    const igual = compatibility(m({ a: 5, b: 4, c: 1 }), m({ a: 5, b: 4, c: 1 }))!;
    const oposto = compatibility(m({ a: 5, b: 5, c: 1 }), m({ a: 1, b: 1, c: 5 }))!;
    expect(igual.score).toBe(69); // (1×3 + 0,5×5) / 8
    expect(oposto.score).toBe(31);
    expect(igual.loved).toEqual(["a", "b"]);
    expect(oposto.split).toEqual(["a", "b", "c"]);
    const muitos = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`g${i}`, 4]));
    expect(compatibility(m(muitos), m(muitos))!.score).toBeGreaterThan(90);
  });

  it("rótulos", () => {
    expect(compatibilityLabel(90)).toBe("Almas gêmeas");
    expect(compatibilityLabel(20)).toBe("Opostos");
  });
});

describe("recomendações", () => {
  it("soma votos dos parecidos, ignora o que já tenho e notas baixas", () => {
    const r = recommend(
      [
        { similarity: 0.9, ratings: m({ x: 5, y: 4, tenho: 5, ruim: 2 }) },
        { similarity: 0.5, ratings: m({ y: 5 }) },
        { similarity: 0, ratings: m({ z: 5 }) },
      ],
      new Set(["tenho"]),
    );
    // y: 0,9×1 + 0,5×2 = 1,9; x: 0,9×2 = 1,8
    expect(r.map((x) => x.gameId)).toEqual(["y", "x"]);
    expect(r[0].votes).toBe(2);
  });
});

describe("gêneros e notas", () => {
  it("gêneros pelas horas, dividindo jogos com vários gêneros", () => {
    const g = topGenres([
      { genres: ["RPG"], minutes: 6000 },
      { genres: ["RPG", "Ação"], minutes: 1200 },
      { genres: [], minutes: 9999 },
    ]);
    expect(g[0].genre).toBe("RPG");
    expect(g[0].share).toBeCloseTo(110 / 120);
  });

  it("mais exigente que X%", () => {
    expect(stricterThan(3, [4, 4.5, 2, 3])).toBe(50);
  });
});
