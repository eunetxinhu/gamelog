import { NextResponse, type NextRequest } from "next/server";
import { clientIpHash, rateLimit } from "@/lib/rate-limit";
import { parseCspReport } from "@/lib/csp";
import { recordError } from "@/lib/error-log";

/**
 * Relatórios de bloqueio da CSP (o navegador manda sozinho). Viram erros agrupados em
 * /moderacao/erros: se algo legítimo for bloqueado, a moderação fica sabendo.
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimit("csp-report", await clientIpHash());
  if (!limit.ok) return new NextResponse(null, { status: 204 });
  const text = await req.text();
  if (text.length > 20_000) return new NextResponse(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  for (const v of parseCspReport(body)) {
    await recordError({ kind: "client", message: `CSP bloqueou ${v.directive}: ${v.blocked}`, stack: v.source, path: v.page });
  }
  return new NextResponse(null, { status: 204 });
}
