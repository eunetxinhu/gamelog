import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from "./password";
import { hashToken, isTokenShape, newToken } from "./auth/tokens";

describe("senhas", () => {
  it("confere senha criada aqui", async () => {
    const h = await hashPassword("pirata123");
    expect(await verifyPassword("pirata123", h)).toBe(true);
    expect(await verifyPassword("pirata124", h)).toBe(false);
  });

  it("aceita os hashes que vieram do Supabase ($2a$10$)", async () => {
    // O Supabase Auth (GoTrue) grava bcrypt com prefixo $2a$ e custo 10
    const supabaseStyle = bcrypt.hashSync("senha-antiga", 10).replace(/^\$2b\$/, "$2a$");
    expect(supabaseStyle.startsWith("$2a$10$")).toBe(true);
    expect(await verifyPassword("senha-antiga", supabaseStyle)).toBe(true);
  });

  it("recusa hash ausente ou estranho", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "texto-puro")).toBe(false);
    expect(await verifyPassword("x", DUMMY_HASH)).toBe(false);
  });

  it("regras de senha", () => {
    expect(passwordProblem("12345")).toMatch(/pelo menos 6/);
    expect(passwordProblem("123456")).toBeNull();
    expect(passwordProblem("😀".repeat(19))).toMatch(/longa/); // 76 bytes
  });
});

describe("tokens", () => {
  it("gera token de 256 bits e guarda só o hash", () => {
    const { token, hash } = newToken();
    expect(isTokenShape(token)).toBe(true);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken().token).not.toBe(token);
  });
  it("recusa formato que não é nosso", () => {
    expect(isTokenShape("abc")).toBe(false);
    expect(isTokenShape("' OR 1=1 --")).toBe(false);
    expect(isTokenShape(undefined)).toBe(false);
  });
});
