import { describe, expect, it } from "vitest";
import { buildCsp, cspMode, makeNonce, parseCspReport } from "./csp";

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: "abc123", dev: false });
  const dir = (name: string) => csp.split("; ").find((d) => d.startsWith(name + " "));
  it("só roda script com o nonce do request", () => {
    expect(dir("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("fecha iframe, plugins, base e formulário para fora", () => {
    expect(dir("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(dir("object-src")).toBe("object-src 'none'");
    expect(dir("base-uri")).toBe("base-uri 'self'");
    expect(dir("form-action")).toBe("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("em desenvolvimento libera o eval do React e o websocket do recarregamento", () => {
    const d = buildCsp({ nonce: "x", dev: true });
    expect(d).toContain("'unsafe-eval'");
    expect(d).toContain("ws:");
    expect(d).not.toContain("upgrade-insecure-requests");
  });
});

describe("makeNonce e cspMode", () => {
  it("nonce novo a cada chamada, em base64", () => {
    const a = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(makeNonce());
  });
  it("modo padrão é bloquear", () => {
    expect(cspMode(undefined)).toBe("enforce");
    expect(cspMode("report-only")).toBe("report-only");
    expect(cspMode("off")).toBe("off");
    expect(cspMode("qualquer")).toBe("enforce");
  });
});

describe("parseCspReport", () => {
  it("lê o formato antigo e guarda só a origem do que foi bloqueado", () => {
    expect(
      parseCspReport({
        "csp-report": { "document-uri": "https://site.gg/u/neto?x=1", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.com/a.js?token=1" },
      }),
    ).toEqual([{ directive: "script-src-elem", blocked: "https://evil.com", page: "/u/neto", source: null }]);
  });
  it("lê o Reporting API e ignora extensões do navegador", () => {
    const out = parseCspReport([
      { type: "csp-violation", body: { documentURL: "https://site.gg/feed", effectiveDirective: "img-src", blockedURL: "inline" } },
      { type: "csp-violation", body: { documentURL: "https://site.gg/feed", effectiveDirective: "script-src", blockedURL: "chrome-extension://abc/x.js" } },
    ]);
    expect(out).toEqual([{ directive: "img-src", blocked: "inline", page: "/feed", source: null }]);
  });
  it("ignora lixo", () => {
    expect(parseCspReport("x")).toEqual([]);
    expect(parseCspReport({})).toEqual([]);
  });
});
