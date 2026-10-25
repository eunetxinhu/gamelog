import { describe, expect, it } from "vitest";
import { evaluate, RATE_RULES, rateKey, retryMessage, secondsUntilReset, windowStart } from "./rate-limit-rules";

describe("janela fixa", () => {
  it("alinha o início da janela", () => {
    const now = Date.UTC(2026, 9, 25, 12, 7, 42);
    expect(windowStart(now, 60).toISOString()).toBe("2026-10-25T12:07:00.000Z");
    expect(windowStart(now, 3600).toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(windowStart(now, 86400).toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });

  it("calcula quanto falta para a janela virar", () => {
    const now = Date.UTC(2026, 9, 25, 12, 7, 42);
    expect(secondsUntilReset(now, 60)).toBe(18);
    expect(secondsUntilReset(now, 3600)).toBe(52 * 60 + 18);
  });

  it("nunca devolve espera zero", () => {
    expect(secondsUntilReset(Date.UTC(2026, 0, 1, 0, 0, 59, 999), 60)).toBe(1);
  });
});

describe("evaluate", () => {
  const rules = [
    { limit: 3, windowSec: 60 },
    { limit: 10, windowSec: 86400 },
  ];
  const now = Date.UTC(2026, 9, 25, 12, 0, 30);

  it("deixa passar dentro do limite (o limite é inclusivo)", () => {
    expect(evaluate(rules, [3, 10], now)).toEqual({ ok: true });
  });

  it("bloqueia quando passa de uma janela", () => {
    expect(evaluate(rules, [4, 5], now)).toEqual({ ok: false, retryAfterSec: 30 });
  });

  it("usa a maior espera quando várias janelas estouram", () => {
    const r = evaluate(rules, [4, 11], now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBe(12 * 3600 - 30);
  });
});

describe("mensagens e chaves", () => {
  it("formata a espera em s, min e h", () => {
    expect(retryMessage(40)).toContain("40 s");
    expect(retryMessage(150)).toContain("3 min");
    expect(retryMessage(7200)).toContain("2 h");
  });

  it("a chave separa ação, janela e quem", () => {
    expect(rateKey("comment", 60, "abc")).toBe("comment:60:abc");
    expect(rateKey("comment", 60, "x".repeat(500)).length).toBe(160);
  });

  it("toda regra tem limite e janela positivos", () => {
    for (const rules of Object.values(RATE_RULES)) {
      for (const r of rules) {
        expect(r.limit).toBeGreaterThan(0);
        expect(r.windowSec).toBeGreaterThan(0);
      }
    }
  });
});
