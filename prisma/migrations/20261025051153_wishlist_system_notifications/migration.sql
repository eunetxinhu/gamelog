-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DEAL';
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY';

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "discount_percent" SMALLINT,
ADD COLUMN     "price_checked_at" TIMESTAMP(3),
ADD COLUMN     "price_final" INTEGER,
ADD COLUMN     "price_original" INTEGER;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "game_id" TEXT,
ALTER COLUMN "actor_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "wishlist_items" (
    "user_id" UUID NOT NULL,
    "game_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_price" INTEGER,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("user_id","game_id")
);

-- CreateIndex
CREATE INDEX "wishlist_items_game_id_idx" ON "wishlist_items"("game_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Manual: RLS na tabela nova (acesso só via Prisma no servidor)
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
