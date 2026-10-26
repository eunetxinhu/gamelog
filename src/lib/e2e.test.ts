import { afterEach, describe, expect, it, vi } from "vitest";
import { e2eAuthEnabled, e2eUserId } from "./e2e";

describe("login de teste (E2E)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fica desligado sem E2E_AUTH", () => {
    vi.stubEnv("E2E_AUTH", "");
    expect(e2eAuthEnabled()).toBe(false);
  });

  it("nunca liga na Vercel, mesmo com E2E_AUTH=1", () => {
    vi.stubEnv("E2E_AUTH", "1");
    vi.stubEnv("VERCEL", "1");
    expect(e2eAuthEnabled()).toBe(false);
  });

  it("liga com E2E_AUTH=1 fora da Vercel", () => {
    vi.stubEnv("E2E_AUTH", "1");
    vi.stubEnv("VERCEL", "");
    expect(e2eAuthEnabled()).toBe(true);
  });

  it("só aceita UUID no cookie", () => {
    expect(e2eUserId("e2e00000-0000-4000-8000-000000000001")).toBe("e2e00000-0000-4000-8000-000000000001");
    expect(e2eUserId("admin")).toBeNull();
    expect(e2eUserId(undefined)).toBeNull();
  });
});
