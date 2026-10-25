import { describe, expect, it } from "vitest";
import { AWARD_LIMITS, awardLook, cleanAward, titleOf } from "./awards";

describe("prêmios", () => {
  it("aceita título com símbolo e estilo válidos, arrumando espaços", () => {
    expect(cleanAward({ text: "  Rei   dos Piratas ", icon: "jolly-roger", style: "crimson" })).toEqual({
      ok: true,
      value: { text: "Rei dos Piratas", icon: "jolly-roger", style: "crimson", description: null },
    });
  });

  it("recusa vazio, longo demais, símbolo ou estilo desconhecido", () => {
    expect(cleanAward({ text: " ", icon: "crown", style: "gold" }).ok).toBe(false);
    expect(cleanAward({ text: "x".repeat(AWARD_LIMITS.title + 1), icon: "crown", style: "gold" }).ok).toBe(false);
    expect(cleanAward({ text: "Ok", icon: "unicornio", style: "gold" }).ok).toBe(false);
    expect(cleanAward({ text: "Ok", icon: "crown", style: "neon" }).ok).toBe(false);
    expect(cleanAward({ text: "Ok", icon: "crown", style: "gold", description: "x".repeat(AWARD_LIMITS.description + 1) }).ok).toBe(false);
  });

  it("valores antigos ou nulos viram coroa dourada", () => {
    expect(awardLook(null, undefined)).toEqual({ icon: "crown", style: "gold" });
    expect(awardLook("ship", "lixo")).toEqual({ icon: "ship", style: "gold" });
  });

  it("titleOf: sem título = null; com título junta símbolo e estilo", () => {
    expect(titleOf({ title: null })).toBeNull();
    expect(titleOf({ title: "Fundador & CEO", titleIcon: null, titleStyle: null })).toEqual({ text: "Fundador & CEO", icon: "crown", style: "gold" });
  });
});
