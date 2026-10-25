-- =============================================================================
--  Títulos e selos exclusivos dados pela moderação.
-- =============================================================================

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AWARD';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "title_icon" VARCHAR(20),
ADD COLUMN     "title_style" VARCHAR(20);

-- CreateTable
CREATE TABLE "awarded_badges" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "description" VARCHAR(140),
    "icon" VARCHAR(20) NOT NULL,
    "style" VARCHAR(20) NOT NULL,
    "awarded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "awarded_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "awarded_badges_user_id_created_at_idx" ON "awarded_badges"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "awarded_badges" ADD CONSTRAINT "awarded_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "awarded_badges" ADD CONSTRAINT "awarded_badges_awarded_by_id_fkey" FOREIGN KEY ("awarded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual: o título que já existe (fundador) fica com a coroa dourada
UPDATE "users" SET "title_icon" = 'crown', "title_style" = 'gold' WHERE "title" IS NOT NULL;

-- Manual: RLS na tabela nova (acesso só via Prisma no servidor)
ALTER TABLE awarded_badges ENABLE ROW LEVEL SECURITY;

-- Manual: o fundador modera e premia perfis
UPDATE "users" SET "is_admin" = true WHERE "username" = 'eunetxinhu';
