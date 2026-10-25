import { describe, expect, it } from "vitest";
import { didYouMean, escapeLike, normalizeQuery, sameTitle } from "./search-query";

describe("normalizeQuery", () => {
  it("limpa espaços, @ e caracteres de controle", () => {
    expect(normalizeQuery("  @Neto\t ")).toBe("Neto");
    expect(normalizeQuery("elden\n\nring")).toBe("elden ring");
    expect(normalizeQuery(null)).toBe("");
  });

  it("corta buscas muito longas", () => {
    expect(normalizeQuery("a".repeat(200))).toHaveLength(80);
  });
});

describe("escapeLike", () => {
  it("escapa curingas do ILIKE", () => {
    expect(escapeLike("100%_real\\")).toBe("100\\%\\_real\\\\");
  });
});

describe("sameTitle", () => {
  it("ignora caixa, acento, pontuação e marcas", () => {
    expect(sameTitle("Pokémon™ Legends: Arceus", "pokemon legends arceus")).toBe(true);
    expect(sameTitle("Hades", "Hades II")).toBe(false);
  });
});

describe("didYouMean", () => {
  it("sugere quando a busca tinha erro de digitação", () => {
    expect(didYouMean("zelda breth", { title: "The Legend of Zelda: Breath of the Wild", score: 0.6 })).toBe(
      "The Legend of Zelda: Breath of the Wild",
    );
  });

  it("não sugere quando o título já contém a busca", () => {
    expect(didYouMean("zelda", { title: "The Legend of Zelda", score: 1 })).toBeNull();
  });

  it("não sugere resultado pouco parecido", () => {
    expect(didYouMean("xyz", { title: "Hades", score: 0.1 })).toBeNull();
    expect(didYouMean("xyz", undefined)).toBeNull();
  });
});
