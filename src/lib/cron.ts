import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Chamadas de cron vêm com `Authorization: Bearer $CRON_SECRET` (a Vercel manda sozinha;
 * o GitHub Actions manda pelo segredo do repositório). Sem a variável, nada passa.
 */
export function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
