import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { SyncStep, SyncTrigger } from "@/generated/prisma/enums";
import type { SteamSyncError } from "@/app/(app)/settings/profile/_actions/types";
import { SYNC_INTERVAL, RETRY_AFTER_ERROR } from "@/lib/steam/schedule";
import { recordError } from "@/lib/error-log";
import { stepAchievements, stepCovers, stepFinalize, stepLibrary, stepRare, stepWishlist, type StepOutcome, type SyncUser } from "@/lib/steam/sync";
import { MAX_ATTEMPTS, MAX_PARALLEL_WORKERS, retryDelayMs, STALE_LOCK_MS, summarize, jobProgress, type LibraryResult, type SyncSummary, type StepProgress } from "./sync-plan";

// =============================================================================
//  Fila de sincronização (Postgres). Um job por sincronização, dividido em tarefas:
//
//    LIBRARY ──► ACHIEVEMENTS × N (lotes em paralelo) ─┐
//            ├─► RARE                                  │
//            ├─► WISHLIST                              ├─► FINALIZE (quando o resto terminou)
//            └─► COVERS                                │
//
//  Qualquer worker pega a próxima tarefa livre com `FOR UPDATE SKIP LOCKED`, então
//  vários rodam ao mesmo tempo sem pegar a mesma. Falha passageira volta para a fila
//  com espera crescente; tarefa de worker que caiu (timeout, deploy) volta sozinha.
//  Workers: o próprio request depois da resposta (`after`), /api/jobs/sync (acordado
//  pela fila para paralelizar) e o cron (rede de segurança).
// =============================================================================

/** Intervalo mínimo entre sincronizações pedidas pela pessoa. */
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
/** Job ativo há mais que isso está travado (nunca deveria acontecer): falha para liberar um novo. */
const STUCK_JOB_MS = 60 * 60 * 1000;

const userSelect = { id: true, username: true, steamId: true, steamLastSyncAt: true, lastSeenAt: true } as const;

export type EnqueueResult = { ok: true; jobId: string; reused: boolean } | { ok: false; error: SteamSyncError };

/**
 * Enfileira uma sincronização. Se já tem uma andando para a pessoa, devolve ela
 * (duas abas, botão + automática não duplicam: há um índice único parcial no banco).
 */
export async function enqueueSteamSync(userId: string, trigger: SyncTrigger): Promise<EnqueueResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true } });
  if (!user?.steamId) return { ok: false, error: { code: "STEAM_NOT_LINKED", message: "Entre com a Steam para vincular sua conta." } };

  await failStuckJobs();
  const active = await prisma.syncJob.findFirst({ where: { userId, status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
  if (active) return { ok: true, jobId: active.id, reused: true };

  if (trigger !== "CRON") {
    const recent = await prisma.syncJob.findFirst({
      where: { userId, status: "DONE", finishedAt: { gte: new Date(Date.now() - SYNC_COOLDOWN_MS) } },
      orderBy: { finishedAt: "desc" },
      select: { id: true, finishedAt: true },
    });
    if (recent) {
      // Automática: só mostra a última; botão: avisa quanto falta
      if (trigger === "AUTO") return { ok: true, jobId: recent.id, reused: true };
      const retryAfterSeconds = Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - recent.finishedAt!.getTime())) / 1000);
      return {
        ok: false,
        error: { code: "SYNC_COOLDOWN", message: `Você sincronizou há pouco. Aguarde ${Math.ceil(retryAfterSeconds / 60)} min.`, retryAfterSeconds },
      };
    }
  }

  try {
    const job = await prisma.$transaction(async (tx) => {
      const job = await tx.syncJob.create({ data: { userId, trigger, tasks: { create: { step: "LIBRARY" } } }, select: { id: true } });
      // Provisório (o FINALIZE grava o de verdade): o cron não enfileira de novo enquanto esta roda
      await tx.user.update({ where: { id: userId }, data: { steamNextSyncAt: new Date(Date.now() + RETRY_AFTER_ERROR) } });
      return job;
    });
    return { ok: true, jobId: job.id, reused: false };
  } catch (err) {
    // Outro request criou o job ao mesmo tempo (índice único parcial)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.syncJob.findFirst({ where: { userId, status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
      if (again) return { ok: true, jobId: again.id, reused: true };
    }
    throw err;
  }
}

type ClaimedTask = { id: string; job_id: string; step: SyncStep; payload: unknown; attempts: number };

// As colunas são TIMESTAMP sem fuso, gravadas em UTC pelo Prisma: no SQL cru, compara
// com o "agora" em UTC (não depende do fuso configurado no banco).
const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

/** Pega a próxima tarefa livre (ou nenhuma). FINALIZE só quando as outras do job terminaram. */
async function claimTask(): Promise<ClaimedTask | null> {
  const rows = await prisma.$queryRaw<ClaimedTask[]>`
    UPDATE sync_tasks t
    SET status = 'RUNNING', locked_at = ${NOW_UTC}, attempts = t.attempts + 1
    WHERE t.id = (
      SELECT c.id FROM sync_tasks c
      JOIN sync_jobs j ON j.id = c.job_id AND j.status IN ('QUEUED', 'RUNNING')
      WHERE c.status = 'QUEUED' AND c.run_after <= ${NOW_UTC}
        AND (c.step <> 'FINALIZE' OR NOT EXISTS (
          SELECT 1 FROM sync_tasks o WHERE o.job_id = c.job_id AND o.id <> c.id AND o.status IN ('QUEUED', 'RUNNING')
        ))
      ORDER BY CASE c.step WHEN 'LIBRARY' THEN 0 WHEN 'ACHIEVEMENTS' THEN 1 WHEN 'FINALIZE' THEN 3 ELSE 2 END, c.created_at
      FOR UPDATE OF c SKIP LOCKED
      LIMIT 1
    )
    RETURNING t.id, t.job_id, t.step, t.payload, t.attempts`;
  const task = rows[0] ?? null;
  if (task) await prisma.syncJob.updateMany({ where: { id: task.job_id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } });
  return task;
}

/** Tarefas "rodando" de um worker que caiu voltam para a fila (ou falham depois de 3 tentativas). */
async function requeueStale() {
  await prisma.$executeRaw`
    UPDATE sync_tasks
    SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'FAILED'::"SyncTaskStatus" ELSE 'QUEUED'::"SyncTaskStatus" END,
        locked_at = NULL, error = 'O worker parou no meio (tempo esgotado); tentando de novo.'
    WHERE status = 'RUNNING' AND locked_at < ${NOW_UTC} - make_interval(secs => ${STALE_LOCK_MS / 1000})`;
  // Biblioteca que desistiu: sem ela não há o que fazer no job
  const dead = await prisma.syncJob.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] }, tasks: { some: { step: "LIBRARY", status: "FAILED" } } },
    select: { id: true, userId: true },
  });
  for (const j of dead) await failJob(j.id, j.userId, { code: "STEAM_UNAVAILABLE", message: "A Steam não respondeu. Tente novamente em instantes." });
}

async function failStuckJobs() {
  const stuck = await prisma.syncJob.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: new Date(Date.now() - STUCK_JOB_MS) } },
    select: { id: true, userId: true },
  });
  for (const j of stuck) await failJob(j.id, j.userId, { code: "UNKNOWN", message: "A sincronização travou. Tente de novo." });
}

/** Falhas que dependem da pessoa (privacidade, conta) não são problema do site. */
const EXPECTED_FAILURES = new Set(["STEAM_PRIVATE", "STEAM_NOT_FOUND", "STEAM_NOT_LINKED"]);

async function failJob(jobId: string, userId: string, error: SteamSyncError) {
  // O resto vira alerta para a moderação (agrupado, push no máximo 1x/h por tipo de erro)
  if (!EXPECTED_FAILURES.has(error.code)) {
    await recordError({ kind: "server", message: `Sincronização da Steam falhou: ${error.code} (${error.message})`, path: "/moderacao/fila" });
  }
  // Privado / conta sumiu: depende da pessoa, o cron tenta 1x por dia. Resto: de novo em 1 h.
  const wait = error.code === "STEAM_PRIVATE" || error.code === "STEAM_NOT_FOUND" ? SYNC_INTERVAL.REGULAR : RETRY_AFTER_ERROR;
  await prisma.$transaction([
    prisma.syncJob.update({ where: { id: jobId }, data: { status: "FAILED", error: error as unknown as Prisma.InputJsonValue, finishedAt: new Date() } }),
    prisma.syncTask.updateMany({ where: { jobId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "SKIPPED", lockedAt: null } }),
    prisma.user.update({ where: { id: userId }, data: { steamNextSyncAt: new Date(Date.now() + wait) } }),
  ]);
}

async function execute(task: ClaimedTask, user: SyncUser): Promise<StepOutcome> {
  const payload = (task.payload ?? {}) as { appIds?: number[]; games?: { appId: number; since: string }[] };
  switch (task.step) {
    case "LIBRARY":
      return stepLibrary(user);
    case "ACHIEVEMENTS":
      return stepAchievements(user, payload.appIds ?? []);
    case "RARE":
      return stepRare(user, payload.games ?? []);
    case "COVERS":
      return stepCovers(payload.appIds ?? []);
    case "WISHLIST":
      return stepWishlist(user);
    case "FINALIZE": {
      const done = await prisma.syncTask.findMany({ where: { jobId: task.job_id, status: { in: ["DONE", "SKIPPED"] } }, select: { step: true, result: true } });
      const summary = summarize(done);
      const lib = done.find((d) => d.step === "LIBRARY")?.result as LibraryResult | undefined;
      return stepFinalize(user, summary, lib?.minutesLast2Weeks ?? 0);
    }
  }
}

/** Roda uma tarefa e grava o resultado. Devolve quantas tarefas novas ela criou. */
async function runTask(task: ClaimedTask): Promise<number> {
  const job = await prisma.syncJob.findUnique({ where: { id: task.job_id }, select: { userId: true, user: { select: userSelect } } });
  if (!job) return 0;

  let outcome: StepOutcome;
  try {
    outcome = await execute(task, job.user);
  } catch (err) {
    console.error(`[sync] ${task.step} falhou`, err);
    outcome = { kind: "retry", message: err instanceof Error ? err.message : String(err) };
  }

  const now = new Date();
  if (outcome.kind === "ok" || outcome.kind === "skipped") {
    const next = outcome.kind === "ok" ? (outcome.next ?? []) : [];
    await prisma.$transaction(async (tx) => {
      await tx.syncTask.update({
        where: { id: task.id },
        data: {
          status: outcome.kind === "ok" ? "DONE" : "SKIPPED",
          result: (outcome.result ?? Prisma.DbNull) as Prisma.InputJsonValue,
          finishedAt: now,
          lockedAt: null,
          error: null,
        },
      });
      if (next.length) {
        await tx.syncTask.createMany({ data: next.map((n) => ({ jobId: task.job_id, step: n.step, payload: n.payload ?? Prisma.DbNull })) });
      }
      if (task.step === "FINALIZE") {
        const done = await tx.syncTask.findMany({ where: { jobId: task.job_id, status: { in: ["DONE", "SKIPPED"] } }, select: { step: true, result: true } });
        const summary = summarize(done);
        await tx.syncJob.update({
          where: { id: task.job_id },
          data: { status: "DONE", finishedAt: now, result: summary ? ({ ...summary, syncedAt: now.toISOString() } as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
        });
      }
    });
    return next.length;
  }

  if (outcome.kind === "fatal") {
    await prisma.syncTask.update({ where: { id: task.id }, data: { status: "FAILED", error: outcome.error.message.slice(0, 500), finishedAt: now, lockedAt: null } });
    await failJob(task.job_id, job.userId, outcome.error);
    return 0;
  }

  // retry
  if (task.attempts < MAX_ATTEMPTS) {
    await prisma.syncTask.update({
      where: { id: task.id },
      data: { status: "QUEUED", lockedAt: null, runAfter: new Date(now.getTime() + retryDelayMs(task.attempts)), error: outcome.message.slice(0, 500) },
    });
  } else if (task.step === "LIBRARY") {
    await prisma.syncTask.update({ where: { id: task.id }, data: { status: "FAILED", error: outcome.message.slice(0, 500), finishedAt: now, lockedAt: null } });
    await failJob(task.job_id, job.userId, outcome.error ?? { code: "STEAM_UNAVAILABLE", message: "A Steam não respondeu. Tente novamente em instantes." });
  } else {
    // Etapa secundária desistiu: o job segue e fecha sem ela (as conquistas voltam na próxima)
    await prisma.syncTask.update({ where: { id: task.id }, data: { status: "FAILED", error: outcome.message.slice(0, 500), finishedAt: now, lockedAt: null } });
  }
  return 0;
}

/**
 * Worker: pega e roda tarefas até acabar a fila ou o tempo. Quando uma etapa cria
 * várias tarefas (lotes de conquistas), acorda outros workers para rodarem em paralelo;
 * se o tempo acabar com tarefa pendente, acorda um para continuar.
 */
export async function runWorker({ budgetMs = 45_000, kick = true }: { budgetMs?: number; kick?: boolean } = {}): Promise<number> {
  const started = Date.now();
  let processed = 0;
  await requeueStale().catch((err) => console.error("[sync] requeueStale", err));
  while (Date.now() - started < budgetMs) {
    const task = await claimTask();
    if (!task) {
      // Nada pronto agora: se uma nova tentativa vence dentro do tempo que sobra, espera por ela
      const next = await prisma.syncTask.findFirst({
        where: { status: "QUEUED", job: { status: { in: ["QUEUED", "RUNNING"] } } },
        orderBy: { runAfter: "asc" },
        select: { runAfter: true },
      });
      const wait = next ? next.runAfter.getTime() - Date.now() : Infinity;
      if (wait > 0 && wait < budgetMs - (Date.now() - started) - 5_000) {
        await new Promise((r) => setTimeout(r, wait + 250));
        continue;
      }
      return processed;
    }
    const spawned = await runTask(task);
    processed++;
    if (kick && spawned > 1) await kickWorkers(Math.min(spawned - 1, MAX_PARALLEL_WORKERS - 1));
  }
  // Tempo acabou com trabalho na fila: outro worker continua
  if (kick && (await prisma.syncTask.count({ where: { status: "QUEUED", runAfter: { lte: new Date() } } }))) await kickWorkers(1);
  return processed;
}

/**
 * Acorda workers em /api/jobs/sync (cada chamada é uma função separada na Vercel, com
 * o próprio tempo). Só manda o pedido: o worker responde na hora e trabalha depois.
 */
export async function kickWorkers(n: number) {
  const base = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret || n <= 0 || process.env.JOBS_INLINE === "1") return;
  await Promise.allSettled(
    Array.from({ length: n }, () =>
      fetch(new URL("/api/jobs/sync", base), {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(3000),
      }),
    ),
  );
}

// ---- Tela -------------------------------------------------------------------------

export type SyncJobView = {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  steps: StepProgress[];
  percent: number;
  result: (SyncSummary & { syncedAt: string }) | null;
  error: SteamSyncError | null;
  /** Ex.: "A Steam não respondeu; tentando de novo às 14:32" */
  notice: string | null;
};

/** Situação de um job da pessoa (para a tela acompanhar). */
export async function getJobView(jobId: string, userId: string): Promise<SyncJobView | null> {
  const job = await prisma.syncJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      status: true,
      result: true,
      error: true,
      tasks: { select: { step: true, status: true, attempts: true, runAfter: true, error: true } },
    },
  });
  if (!job) return null;
  const { steps, percent } = jobProgress(job.tasks);
  const waiting = job.tasks.find((t) => t.status === "QUEUED" && t.attempts > 0 && t.runAfter > new Date());
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return {
    id: job.id,
    status: job.status,
    steps,
    percent: job.status === "DONE" ? 100 : percent,
    result: (job.result as SyncJobView["result"]) ?? null,
    error: (job.error as SteamSyncError | null) ?? null,
    notice: waiting ? `A Steam não respondeu; tentando de novo às ${time.format(waiting.runAfter)}.` : null,
  };
}

/**
 * O job tem tarefa pronta e ninguém trabalhando nele? (ex.: a nova tentativa venceu
 * depois que o worker saiu). Quem acompanha a tela usa isso para acordar um worker.
 */
export async function needsWorker(jobId: string): Promise<boolean> {
  const [ready, running] = await Promise.all([
    prisma.syncTask.count({ where: { jobId, status: "QUEUED", runAfter: { lte: new Date() }, job: { status: { in: ["QUEUED", "RUNNING"] } } } }),
    prisma.syncTask.count({ where: { jobId, status: "RUNNING" } }),
  ]);
  return ready > 0 && running === 0;
}

/** Último job da pessoa (para retomar o acompanhamento ao abrir a página). */
export async function latestJobId(userId: string): Promise<string | null> {
  const job = await prisma.syncJob.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return job?.id ?? null;
}

/** Apaga jobs velhos (cron diário). */
export async function cleanupSyncJobs(days = 14) {
  const { count } = await prisma.syncJob.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) }, status: { in: ["DONE", "FAILED"] } } });
  return count;
}
