-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('PLAYING', 'COMPLETED', 'DROPPED', 'BACKLOG');

-- CreateEnum
CREATE TYPE "LibrarySource" AS ENUM ('STEAM', 'MANUAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "display_name" VARCHAR(60),
    "avatar_url" TEXT,
    "bio" VARCHAR(280),
    "steam_id" VARCHAR(17),
    "steam_persona_name" TEXT,
    "steam_avatar_url" TEXT,
    "steam_last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cover_url" TEXT,
    "summary" TEXT,
    "release_date" DATE,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawg_id" INTEGER,
    "igdb_id" INTEGER,
    "steam_app_id" INTEGER,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_logs" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" TEXT NOT NULL,
    "status" "LogStatus" NOT NULL,
    "rating" SMALLINT,
    "review" TEXT,
    "contains_spoiler" BOOLEAN NOT NULL DEFAULT false,
    "started_at" DATE,
    "finished_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_entries" (
    "user_id" UUID NOT NULL,
    "game_id" TEXT NOT NULL,
    "source" "LibrarySource" NOT NULL DEFAULT 'STEAM',
    "playtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "playtime_2weeks_minutes" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_entries_pkey" PRIMARY KEY ("user_id","game_id")
);

-- CreateTable
CREATE TABLE "favorite_games" (
    "user_id" UUID NOT NULL,
    "game_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "favorite_games_pkey" PRIMARY KEY ("user_id","position")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "following_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","following_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_steam_id_key" ON "users"("steam_id");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "games_rawg_id_key" ON "games"("rawg_id");

-- CreateIndex
CREATE UNIQUE INDEX "games_igdb_id_key" ON "games"("igdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "games_steam_app_id_key" ON "games"("steam_app_id");

-- CreateIndex
CREATE INDEX "games_title_idx" ON "games"("title");

-- CreateIndex
CREATE INDEX "game_logs_user_id_status_idx" ON "game_logs"("user_id", "status");

-- CreateIndex
CREATE INDEX "game_logs_game_id_created_at_idx" ON "game_logs"("game_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "game_logs_updated_at_idx" ON "game_logs"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "game_logs_user_id_game_id_key" ON "game_logs"("user_id", "game_id");

-- CreateIndex
CREATE INDEX "library_entries_user_id_playtime_minutes_idx" ON "library_entries"("user_id", "playtime_minutes" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "favorite_games_user_id_game_id_key" ON "favorite_games"("user_id", "game_id");

-- CreateIndex
CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

-- AddForeignKey
ALTER TABLE "game_logs" ADD CONSTRAINT "game_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_logs" ADD CONSTRAINT "game_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_games" ADD CONSTRAINT "favorite_games_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_games" ADD CONSTRAINT "favorite_games_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
--  Rodar UMA vez após a primeira migration:
--    npx prisma migrate dev --name init --create-only
--    (cole este arquivo no final do migration.sql gerado)  →  npx prisma migrate dev
-- =============================================================================

-- Regras de domínio que o Prisma não expressa ---------------------------------
ALTER TABLE game_logs
  ADD CONSTRAINT game_logs_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

ALTER TABLE favorite_games
  ADD CONSTRAINT favorite_games_position_range CHECK (position BETWEEN 1 AND 4);

ALTER TABLE follows
  ADD CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id);

ALTER TABLE users
  ADD CONSTRAINT users_steam_id_format CHECK (steam_id IS NULL OR steam_id ~ '^7656119[0-9]{10}$');

-- Vínculo com o Supabase Auth: apagar a conta remove o perfil ------------------
-- Condicional: o shadow database do `prisma migrate dev` não tem o schema auth.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_fk FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

-- Segurança: o app acessa o banco só pelo Prisma (role postgres, server-side).
-- O Supabase expõe o schema "public" via Data API com a anon key; sem RLS,
-- QUALQUER visitante leria os dados dos usuários. RLS ligado e sem policies = bloqueado.
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE games           ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_games  ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows         ENABLE ROW LEVEL SECURITY;
-- Condicional: no shadow database do `prisma migrate dev` essa tabela não existe.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE _prisma_migrations ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
