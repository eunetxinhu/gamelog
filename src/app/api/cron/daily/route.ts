import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { checkWishlistDeals } from "@/lib/deals";
import { notifyWeeklySummaries } from "@/lib/weekly";
import { notifyReleases, refreshUpcomingReleases } from "@/lib/releases";
import { backfillRawgPlaytime } from "@/lib/time-to-beat";
import { cleanupRateLimits } from "@/lib/rate-limit";

export const maxDuration = 60;

/** Roda uma etapa sem deixar a falha dela derrubar as outras. */
async function step<T>(name: string, run: () => Promise<T>): Promise<T | { error: true }> {
  try {
    return await run();
  } catch (err) {
    console.error(`[cron] ${name}`, err);
    return { error: true };
  }
}

/**
 * Tarefas de 1x por dia (Vercel Cron às 09h UTC = 06h de Brasília, ver vercel.json).
 * A ordem importa: a data de lançamento é atualizada antes do aviso "lançou hoje".
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();

  const deals = await step("promoções", checkWishlistDeals);
  const releasesRefresh = await step("datas de lançamento", () => refreshUpcomingReleases(20));
  const releases = await step("lançamentos", () => notifyReleases());
  const weekly = await step("resumo semanal", notifyWeeklySummaries);
  const rawg = await step("tempo para zerar", () => backfillRawgPlaytime(30));
  const rateLimits = await step("limites", cleanupRateLimits);

  const result = { deals, releasesRefresh, releases, weekly, rawg, rateLimitsCleaned: rateLimits, ms: Date.now() - started };
  console.log("[cron] daily", result);
  return NextResponse.json(result);
}
