import "server-only";
import { prisma } from "@/lib/prisma";
import type { SteamSyncError } from "@/app/(app)/settings/profile/_actions/types";
import { STEP_LABEL } from "./sync-plan";

/** Visão da fila para a moderação: saúde nas últimas 24 h, falhas, novas tentativas e travados. */
export async function getQueueOverview() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const stuckCutoff = new Date(now.getTime() - 3 * 60_000);

  const [byStatus, byTrigger, durations, steps, failed, retrying, running, ready, overdue] = await Promise.all([
    prisma.syncJob.groupBy({ by: ["status"], where: { createdAt: { gte: dayAgo } }, _count: { _all: true } }),
    prisma.syncJob.groupBy({ by: ["trigger"], where: { createdAt: { gte: dayAgo } }, _count: { _all: true } }),
    prisma.$queryRaw<{ p50: number | null; p95: number | null }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM finished_at - created_at)) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM finished_at - created_at)) AS p95
      FROM sync_jobs WHERE status = 'DONE' AND created_at >= ${dayAgo}`,
    prisma.$queryRaw<{ step: string; done: number; failed: number; skipped: number; retried: number; avg_s: number | null }[]>`
      SELECT step::text,
             count(*) FILTER (WHERE status = 'DONE')::int AS done,
             count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
             count(*) FILTER (WHERE status = 'SKIPPED')::int AS skipped,
             count(*) FILTER (WHERE attempts > 1)::int AS retried,
             avg(EXTRACT(EPOCH FROM finished_at - locked_at)) FILTER (WHERE status = 'DONE' AND locked_at IS NOT NULL) AS avg_s
      FROM sync_tasks WHERE created_at >= ${dayAgo}
      GROUP BY step ORDER BY step`,
    prisma.syncJob.findMany({
      where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, trigger: true, error: true, createdAt: true, user: { select: { id: true, username: true } } },
    }),
    prisma.syncTask.findMany({
      where: { status: "QUEUED", attempts: { gt: 0 } },
      orderBy: { runAfter: "asc" },
      take: 30,
      select: { id: true, step: true, attempts: true, runAfter: true, error: true, job: { select: { user: { select: { username: true } } } } },
    }),
    prisma.syncTask.findMany({
      where: { status: "RUNNING" },
      orderBy: { lockedAt: "asc" },
      take: 30,
      select: { id: true, step: true, lockedAt: true, job: { select: { user: { select: { username: true } } } } },
    }),
    prisma.syncTask.count({ where: { status: "QUEUED", runAfter: { lte: now }, job: { status: { in: ["QUEUED", "RUNNING"] } } } }),
    // Cron atrasado: deveria ter sincronizado há mais de 2 h e não tem job andando
    prisma.user.count({
      where: { steamId: { not: null }, steamNextSyncAt: { lt: new Date(now.getTime() - 2 * 3_600_000) }, syncJobs: { none: { status: { in: ["QUEUED", "RUNNING"] } } } },
    }),
  ]);

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    last24h: {
      done: count("DONE"),
      failed: count("FAILED"),
      active: count("QUEUED") + count("RUNNING"),
      byTrigger: Object.fromEntries(byTrigger.map((t) => [t.trigger, t._count._all])) as Record<string, number>,
      p50s: durations[0]?.p50 ?? null,
      p95s: durations[0]?.p95 ?? null,
    },
    steps: steps.map((s) => ({ ...s, label: STEP_LABEL[s.step as keyof typeof STEP_LABEL] ?? s.step, avg_s: s.avg_s === null ? null : Number(s.avg_s) })),
    failed: failed.map((f) => ({ ...f, error: f.error as SteamSyncError | null })),
    retrying,
    running: running.map((r) => ({ ...r, stuck: Boolean(r.lockedAt && r.lockedAt < stuckCutoff) })),
    ready,
    overdue,
  };
}

/** Falhas de sincronização nas últimas 24 h que não são perfil privado (selo no painel). */
export async function countRecentSyncFailures() {
  return prisma.syncJob.count({
    where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 86_400_000) }, NOT: { error: { path: ["code"], equals: "STEAM_PRIVATE" } } },
  });
}
