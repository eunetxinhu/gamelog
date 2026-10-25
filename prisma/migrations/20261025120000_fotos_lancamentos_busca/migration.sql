-- =============================================================================
--  Fotos no feed, calendário de lançamentos, tempo para zerar, sincronização
--  escalonada, limite de requisições e busca tolerante a erros (pg_trgm).
-- =============================================================================

-- Busca por similaridade. No Supabase as extensões ficam no schema "extensions";
-- num Postgres comum (shadow database do `prisma migrate dev`) o schema é criado aqui.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm' AND n.nspname <> 'extensions') THEN
    -- Já estava ativada em outro schema (ex.: public): move para o lugar que o app usa
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RELEASE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_seen_at" TIMESTAMP(3),
ADD COLUMN     "steam_next_sync_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "coming_soon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "release_date_text" TEXT,
ADD COLUMN     "rawg_playtime_hours" SMALLINT,
ADD COLUMN     "rawg_playtime_checked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "wishlist_items" ADD COLUMN     "release_notified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" VARCHAR(160) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE INDEX "rate_limits_window_start_idx" ON "rate_limits"("window_start");

-- CreateIndex
CREATE INDEX "users_steam_next_sync_at_idx" ON "users"("steam_next_sync_at");

-- CreateIndex
CREATE INDEX "users_username_trgm_idx" ON "users" USING GIN ("username" extensions.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "users_display_name_trgm_idx" ON "users" USING GIN ("display_name" extensions.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "games_release_date_idx" ON "games"("release_date");

-- CreateIndex
CREATE INDEX "games_title_trgm_idx" ON "games" USING GIN ("title" extensions.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "library_entries_game_id_idx" ON "library_entries"("game_id");

-- Manual: publicações antigas com foto passam a ter a lista de fotos preenchida
UPDATE "activities" SET "images" = ARRAY["image_url"] WHERE "image_url" IS NOT NULL AND cardinality("images") = 0;

-- Manual: datas "chutadas" pela loja (ex.: "2027" virava 1º de janeiro) não são confiáveis.
-- Os jogos voltam a ser conferidos na loja na próxima visita (mídia renova a cada 7 dias).
UPDATE "games" SET "media_synced_at" = NULL WHERE "release_date" IS NOT NULL AND "release_date" > now();

-- Manual: quem já tem Steam entra na fila do cron escalonado
UPDATE "users" SET "steam_next_sync_at" = now() WHERE "steam_id" IS NOT NULL;

-- Manual: RLS na tabela nova (acesso só via Prisma no servidor)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
