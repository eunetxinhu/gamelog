import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronRequest } from "@/lib/cron";
import { enqueueSteamSync, kickWorkers, runWorker } from "@/lib/jobs/queue";
import { MAX_PARALLEL_WORKERS } from "@/lib/jobs/sync-plan";

/** Limite da função na Vercel (plano Hobby: até 60 s). */
export const maxDuration = 60;

/**
 * Sincronização escalonada da Steam: cada pessoa tem um `steamNextSyncAt`, calculado
 * no fim da sincronização conforme a atividade (ver lib/steam/schedule.ts):
 *  - jogou nas últimas 2 semanas ou visitou o site há pouco → a cada 3 h
 *  - normal → 1x por dia
 *  - sem jogar nem visitar há um mês → a cada 3 dias
 *
 * Agora este endpoint só ENFILEIRA quem está vencido (rápido) e trabalha na fila pelo
 * tempo que sobra, acordando workers paralelos. Também é a rede de segurança: termina
 * qualquer tarefa que ficou para trás. A Vercel Hobby chama 1x por dia (vercel.json)
 * e o GitHub Actions de hora em hora (.github/workflows/steam-sync.yml).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const started = Date.now();
  const due = await prisma.user.findMany({
    where: {
      steamId: { not: null },
      OR: [{ steamNextSyncAt: null }, { steamNextSyncAt: { lte: new Date() } }],
      syncJobs: { none: { status: { in: ["QUEUED", "RUNNING"] } } },
    },
    orderBy: { steamNextSyncAt: { sort: "asc", nulls: "first" } },
    take: 200,
    select: { id: true },
  });

  let enqueued = 0;
  for (const u of due) {
    const res = await enqueueSteamSync(u.id, "CRON").catch((err) => {
      console.error("[cron] enqueue", err);
      return null;
    });
    if (res?.ok && !res.reused) enqueued++;
  }

  // Trabalha em paralelo: este request + alguns workers acordados
  if (enqueued > 1) await kickWorkers(Math.min(enqueued - 1, MAX_PARALLEL_WORKERS - 1));
  const processed = await runWorker({ budgetMs: Math.max(5_000, 50_000 - (Date.now() - started)) });

  const summary = { due: due.length, enqueued, processed, ms: Date.now() - started };
  console.log("[cron] steam-sync", summary);
  return NextResponse.json(summary);
}
