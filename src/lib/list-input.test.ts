import { describe, expect, it } from "vitest";
import { cleanListInput, LIST_LIMITS } from "./list-input";

describe("validação de listas", () => {
  it("arruma espaços, tira repetidos e mantém a ordem", () => {
    const r = cleanListInput({
      title: "  Metroidvanias   curtos ",
      description: "  ",
      ranked: true,
      items: [{ slug: "hollow-knight", note: " obrigatório " }, { slug: "steam-70" }, { slug: "hollow-knight", note: "de novo" }],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        title: "Metroidvanias curtos",
        description: null,
        ranked: true,
        items: [
          { slug: "hollow-knight", note: "obrigatório" },
          { slug: "steam-70", note: null },
        ],
      },
    });
  });

  it("recusa sem nome, sem jogos ou com slug estranho", () => {
    expect(cleanListInput({ title: " ", items: [{ slug: "a" }] }).ok).toBe(false);
    expect(cleanListInput({ title: "Ok", items: [] }).ok).toBe(false);
    expect(cleanListInput({ title: "Ok", items: [{ slug: "../etc" }] }).ok).toBe(false);
  });

  it("respeita os limites de tamanho", () => {
    expect(cleanListInput({ title: "x".repeat(LIST_LIMITS.title + 1), items: [{ slug: "a" }] }).ok).toBe(false);
    expect(cleanListInput({ title: "Ok", items: [{ slug: "a", note: "x".repeat(LIST_LIMITS.note + 1) }] }).ok).toBe(false);
    const many = Array.from({ length: LIST_LIMITS.items + 1 }, (_, i) => ({ slug: `steam-${i + 1}` }));
    expect(cleanListInput({ title: "Ok", items: many }).ok).toBe(false);
    expect(cleanListInput({ title: "Ok", items: many.slice(0, LIST_LIMITS.items) }).ok).toBe(true);
  });
});
