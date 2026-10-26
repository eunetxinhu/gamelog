// Agrupamento de erros (sem banco: testável). O mesmo erro em páginas diferentes do
// mesmo tipo (/u/ana e /u/bia) vira uma linha só.

import { createHash } from "node:crypto";

/** Troca ids, números e nomes de usuário por marcadores, para agrupar. */
export function normalizePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.split("?")[0].split("#")[0];
  return clean
    .replace(/\/u\/[^/]+/g, "/u/:usuario")
    .replace(/\/(p|listas|clubes|mensagens|games)\/[^/]+/g, "/$1/:id")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/\b\d+\b/g, ":n")
    .slice(0, 300);
}

export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/\bc[a-z0-9]{24}\b/g, ":id") // cuid
    .replace(/\d{3,}/g, ":n")
    .trim()
    .slice(0, 500);
}

export function errorFingerprint(kind: string, message: string, path: string | null | undefined): string {
  return createHash("sha256")
    .update(`${kind}\n${normalizeMessage(message)}\n${normalizePath(path) ?? ""}`)
    .digest("hex")
    .slice(0, 64);
}
