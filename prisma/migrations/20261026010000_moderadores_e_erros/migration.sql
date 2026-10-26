-- =============================================================================
--  Moderadores de clube (regras e posts fixados) e registro de erros de produção.
-- =============================================================================

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "rules" VARCHAR(1000);

-- AlterTable
ALTER TABLE "club_posts" ADD COLUMN     "pinned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "stack" TEXT,
    "path" VARCHAR(300),
    "method" VARCHAR(10),
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "error_events_fingerprint_key" ON "error_events"("fingerprint");

-- CreateIndex
CREATE INDEX "error_events_resolved_at_last_seen_at_idx" ON "error_events"("resolved_at", "last_seen_at" DESC);

-- Manual: RLS na tabela nova (acesso só via Prisma no servidor)
ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;
