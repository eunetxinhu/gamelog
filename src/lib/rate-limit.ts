import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { evaluate, RATE_RULES, rateKey, retryMessage, windowStart, type RateAction } from "@/lib/rate-limit-rules";

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number; message: string };

/**
 * Conta mais uma tentativa de `action` por `subject` (id do usuário, ou IP/e-mail com hash)
 * e diz se ainda está dentro do limite. Janela fixa guardada no Postgres (tabela rate_limits),
 * então vale entre todas as instâncias da Vercel sem precisar de Redis.
 *
 * Se o banco falhar, deixa passar: o limite protege contra abuso, não pode derrubar o site.
 */
export async function rateLimit(action: RateAction, subject: string): Promise<RateResult> {
  const rules = RATE_RULES[action];
  const now = Date.now();
  try {
    const counts = await Promise.all(
      rules.map(async (rule) => {
        const rows = await prisma.$queryRaw<{ count: number }[]>`
          INSERT INTO rate_limits (key, window_start, count)
          VALUES (${rateKey(action, rule.windowSec, subject)}, ${windowStart(now, rule.windowSec)}, 1)
          ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
          RETURNING count`;
        return rows[0]?.count ?? 1;
      }),
    );
    const verdict = evaluate(rules, counts, now);
    return verdict.ok ? verdict : { ...verdict, message: retryMessage(verdict.retryAfterSec) };
  } catch (err) {
    console.error("[rate-limit]", action, err);
    return { ok: true };
  }
}

/** Hash curto para não guardar IP ou e-mail em texto puro. */
export function hashSubject(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

/** IP de quem fez a requisição (a Vercel preenche x-forwarded-for), já com hash. */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  // Na Vercel esses cabeçalhos são reescritos pela própria Vercel (o visitante não consegue forjar)
  const ip = (h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for"))?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  return hashSubject(ip);
}

/** Apaga janelas velhas (chamado pelo cron diário). */
export async function cleanupRateLimits() {
  const { count } = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 2 * 86_400_000) } } });
  return count;
}
