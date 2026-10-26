import { describe, expect, it } from "vitest";
import { formatVital, parseVitals, rateVital, routeOf } from "./vitals";

describe("routeOf", () => {
  it("agrupa páginas com id", () => {
    expect(routeOf("/u/neto")).toBe("/u/:usuario");
    expect(routeOf("/u/neto/jogos?aba=wishlist")).toBe("/u/:usuario/jogos");
    expect(routeOf("/games/elden-ring")).toBe("/games/:jogo");
    expect(routeOf("/p/cmvpotnxh00015x7drecdaz79")).toBe("/p/:id");
    expect(routeOf("/listas/abc/editar")).toBe("/listas/:id/editar");
    expect(routeOf("/clubes/souls")).toBe("/clubes/:clube");
  });
  it("mantém páginas fixas", () => {
    expect(routeOf("/")).toBe("/");
    expect(routeOf("/feed/")).toBe("/feed");
    expect(routeOf("/listas/nova")).toBe("/listas/nova");
    expect(routeOf("/settings/profile")).toBe("/settings/profile");
  });
  it("não deixa texto livre virar rota", () => {
    expect(routeOf("/busca/ALGO ESTRANHO")).toBe("/busca/:x");
  });
});

describe("rateVital e formatVital", () => {
  it("usa os limites do Google", () => {
    expect(rateVital("LCP", 2400)).toBe("good");
    expect(rateVital("LCP", 3000)).toBe("needs-improvement");
    expect(rateVital("LCP", 4100)).toBe("poor");
    expect(rateVital("CLS", 0.05)).toBe("good");
    expect(rateVital("INP", 600)).toBe("poor");
  });
  it("formata", () => {
    expect(formatVital("LCP", 2450)).toBe("2,5 s");
    expect(formatVital("INP", 120.4)).toBe("120 ms");
    expect(formatVital("CLS", 0.123)).toBe("0.12");
  });
});

describe("parseVitals", () => {
  it("aceita só métricas conhecidas e valores possíveis", () => {
    const out = parseVitals([
      { name: "LCP", value: 1800, path: "/u/neto", device: "mobile" },
      { name: "XSS", value: 1, path: "/" },
      { name: "INP", value: -5, path: "/" },
      { name: "CLS", value: 50, path: "/" },
      { name: "TTFB", value: 300, path: "https://evil.com" },
      { name: "FCP", value: 900, path: "/feed", device: "tv" },
    ]);
    expect(out).toEqual([
      { name: "LCP", value: 1800, route: "/u/:usuario", device: "mobile" },
      { name: "FCP", value: 900, route: "/feed", device: "desktop" },
    ]);
  });
  it("ignora corpo que não é lista e corta em 20", () => {
    expect(parseVitals({ name: "LCP" })).toEqual([]);
    expect(parseVitals(Array.from({ length: 50 }, () => ({ name: "LCP", value: 1, path: "/" })))).toHaveLength(20);
  });
});
