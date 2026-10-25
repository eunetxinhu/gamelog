-- =============================================================================
--  Comunidade: listas de jogos, título especial no perfil e "Primeiros passos".
-- =============================================================================

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LIST_LIKE';
ALTER TYPE "NotificationType" ADD VALUE 'LIST_COMMENT';

-- AlterEnum
ALTER TYPE "ReportTarget" ADD VALUE 'LIST';
ALTER TYPE "ReportTarget" ADD VALUE 'LIST_COMMENT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "title" VARCHAR(40),
ADD COLUMN     "onboarded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "list_id" TEXT;

-- CreateTable
CREATE TABLE "game_lists" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(1000),
    "ranked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_list_items" (
    "list_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "note" VARCHAR(280),

    CONSTRAINT "game_list_items_pkey" PRIMARY KEY ("list_id","game_id")
);

-- CreateTable
CREATE TABLE "game_list_likes" (
    "list_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_list_likes_pkey" PRIMARY KEY ("list_id","user_id")
);

-- CreateTable
CREATE TABLE "game_list_comments" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_list_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_lists_user_id_updated_at_idx" ON "game_lists"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "game_lists_created_at_idx" ON "game_lists"("created_at" DESC);

-- CreateIndex
CREATE INDEX "game_list_items_list_id_position_idx" ON "game_list_items"("list_id", "position");

-- CreateIndex
CREATE INDEX "game_list_items_game_id_idx" ON "game_list_items"("game_id");

-- CreateIndex
CREATE INDEX "game_list_likes_user_id_idx" ON "game_list_likes"("user_id");

-- CreateIndex
CREATE INDEX "game_list_likes_created_at_idx" ON "game_list_likes"("created_at");

-- CreateIndex
CREATE INDEX "game_list_comments_list_id_created_at_idx" ON "game_list_comments"("list_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "game_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_lists" ADD CONSTRAINT "game_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_items" ADD CONSTRAINT "game_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "game_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_items" ADD CONSTRAINT "game_list_items_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_likes" ADD CONSTRAINT "game_list_likes_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "game_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_likes" ADD CONSTRAINT "game_list_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_comments" ADD CONSTRAINT "game_list_comments_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "game_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_comments" ADD CONSTRAINT "game_list_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual: regras que o Prisma não expressa
ALTER TABLE "game_list_items" ADD CONSTRAINT "game_list_items_position_positive" CHECK ("position" >= 1);

-- Manual: quem já usa o site não precisa do "Primeiros passos"
UPDATE "users" SET "onboarded_at" = "created_at";

-- Manual: título do fundador
UPDATE "users" SET "title" = 'Fundador & CEO' WHERE "username" = 'eunetxinhu';

-- Manual: RLS nas tabelas novas (acesso só via Prisma no servidor)
ALTER TABLE game_lists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_list_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_list_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_list_comments ENABLE ROW LEVEL SECURITY;
