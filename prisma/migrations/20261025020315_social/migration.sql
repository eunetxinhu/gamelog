-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('STARTED_GAME', 'COMPLETED', 'PLATINUM', 'DROPPED', 'REVIEW');

-- AlterEnum
ALTER TYPE "LogStatus" ADD VALUE 'PLATINUM';

-- AlterTable
ALTER TABLE "library_entries" ADD COLUMN     "achievements_checked_at" TIMESTAMP(3),
ADD COLUMN     "achievements_total" INTEGER,
ADD COLUMN     "achievements_unlocked" INTEGER,
ADD COLUMN     "platinum_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "source" "LibrarySource" NOT NULL DEFAULT 'MANUAL',
    "rating" SMALLINT,
    "review" TEXT,
    "contains_spoiler" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_likes" (
    "activity_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_likes_pkey" PRIMARY KEY ("activity_id","user_id")
);

-- CreateIndex
CREATE INDEX "activities_created_at_idx" ON "activities"("created_at" DESC);

-- CreateIndex
CREATE INDEX "activities_user_id_created_at_idx" ON "activities"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activities_game_id_created_at_idx" ON "activities"("game_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_likes_user_id_idx" ON "activity_likes"("user_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_likes" ADD CONSTRAINT "activity_likes_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_likes" ADD CONSTRAINT "activity_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
--  Manual (não gerado pelo Prisma)
-- =============================================================================

-- A FK users.id → auth.users quebrava o `prisma migrate dev` (referência entre
-- schemas). Troca por trigger: apagar a conta no Supabase continua apagando o perfil.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_fk;

CREATE OR REPLACE FUNCTION public.delete_profile_on_auth_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

-- Condicional: o shadow database do `prisma migrate dev` não tem o schema auth.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
    CREATE TRIGGER on_auth_user_deleted
      AFTER DELETE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.delete_profile_on_auth_delete();
  END IF;
END $$;

ALTER TABLE activities
  ADD CONSTRAINT activities_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

ALTER TABLE activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_likes ENABLE ROW LEVEL SECURITY;
