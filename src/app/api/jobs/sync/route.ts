import { after, NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { runWorker } from "@/lib/jobs/queue";

/** Limite da função na Vercel (plano Hobby: até 60 s). */
export const maxDuration = 60;

/**
 * Worker da fila de sincronização. Acordado pela própria fila (para rodar lotes em
 * paralelo, cada chamada é uma função separada) e protegido pelo CRON_SECRET.
 * Responde na hora e trabalha depois da resposta, então quem acorda não espera.
 */
export async function POST(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  after(() => runWorker({ budgetMs: 50_000 }).catch((err) => console.error("[sync] worker", err)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
