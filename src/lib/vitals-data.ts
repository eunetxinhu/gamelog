import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VITAL_NAMES, type VitalName } from "@/lib/vitals";

export type VitalStat = { n: number; p75: number };
export type RouteVitals = { route: string; views: number; stats: Partial<Record<VitalName, VitalStat>> };

/**
 * p75 de cada métrica por página (o Google avalia pelo p75: 3 de cada 4 visitas
 * estão nesse valor ou melhor). `views` = medições de TTFB (uma por carregamento).
 */
export async function getVitalsSummary({ hours, device }: { hours: number; device: "mobile" | "desktop" | null }) {
  const since = new Date(Date.now() - hours * 3_600_000);
  const deviceFilter = device ? Prisma.sql`AND device = ${device}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ route: string | null; name: string; n: number; p75: number }[]>`
    SELECT route, name, count(*)::int AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75
    FROM web_vitals
    WHERE created_at >= ${since} ${deviceFilter}
    GROUP BY GROUPING SETS ((route, name), (name))`;

  const overall: Partial<Record<VitalName, VitalStat>> = {};
  const byRoute = new Map<string, RouteVitals>();
  for (const r of rows) {
    if (!(VITAL_NAMES as readonly string[]).includes(r.name)) continue;
    const stat = { n: r.n, p75: Number(r.p75) };
    if (r.route === null) {
      overall[r.name as VitalName] = stat;
      continue;
    }
    const entry = byRoute.get(r.route) ?? { route: r.route, views: 0, stats: {} };
    entry.stats[r.name as VitalName] = stat;
    if (r.name === "TTFB") entry.views = r.n;
    byRoute.set(r.route, entry);
  }
  const routes = [...byRoute.values()].sort((a, b) => b.views - a.views);
  return { overall, routes, total: overall.TTFB?.n ?? 0 };
}

/** Apaga medições velhas (cron diário). */
export async function cleanupVitals(days = 30) {
  const { count } = await prisma.webVital.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return count;
}
