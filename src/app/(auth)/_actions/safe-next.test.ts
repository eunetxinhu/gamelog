import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, safeNext } from "./types";

describe("safeNext", () => {
  it("mantém caminhos internos", () => {
    for (const p of ["/feed", "/games/elden-ring?aba=reviews", "/u/neto#top", "/feed?tab=following&before=2026-10-26T00%3A00%3A00.000Z"]) {
      expect(safeNext(p)).toBe(p);
    }
  });

  it("recusa outros sites", () => {
    for (const p of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com", // TAB some na URL → //evil.com (passava antes)
      "/\n/evil.com",
      "/\r\n/evil.com",
      "\t//evil.com",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(safeNext(p)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });
});
