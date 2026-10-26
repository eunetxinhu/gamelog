-- Fila de sincronização da Steam (jobs divididos em tarefas) e origem dos itens da wishlist.

-- CreateEnum
CREATE TYPE "WishlistSource" AS ENUM ('MANUAL', 'STEAM');
CREATE TYPE "SyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');
CREATE TYPE "SyncTrigger" AS ENUM ('MANUAL', 'AUTO', 'CRON');
CREATE TYPE "SyncStep" AS ENUM ('LIBRARY', 'ACHIEVEMENTS', 'RARE', 'COVERS', 'WISHLIST', 'FINALIZE');
CREATE TYPE "SyncTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "wishlist_items" ADD COLUMN "source" "WishlistSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "SyncTrigger" NOT NULL,
    "result" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_tasks" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "step" "SyncStep" NOT NULL,
    "status" "SyncTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "result" JSONB,
    "error" VARCHAR(500),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_jobs_user_id_created_at_idx" ON "sync_jobs"("user_id", "created_at" DESC);
CREATE INDEX "sync_jobs_status_created_at_idx" ON "sync_jobs"("status", "created_at");
CREATE INDEX "sync_tasks_status_run_after_idx" ON "sync_tasks"("status", "run_after");
CREATE INDEX "sync_tasks_job_id_status_idx" ON "sync_tasks"("job_id", "status");

-- Manual: no máximo um job ativo por pessoa (duas abas / botão + automático não duplicam)
CREATE UNIQUE INDEX "sync_jobs_one_active_per_user" ON "sync_jobs"("user_id") WHERE "status" IN ('QUEUED', 'RUNNING');

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_tasks" ADD CONSTRAINT "sync_tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual: só o servidor (Prisma) usa estas tabelas; a chave pública do Supabase não lê nada
ALTER TABLE "sync_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_tasks" ENABLE ROW LEVEL SECURITY;
