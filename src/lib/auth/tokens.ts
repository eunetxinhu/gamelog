import { createHash, randomBytes } from "node:crypto";

/** Token aleatório de 256 bits (vai no cookie ou no link) e o hash que fica no banco. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Só aceita o formato que nós geramos (evita consulta com lixo). */
export function isTokenShape(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
