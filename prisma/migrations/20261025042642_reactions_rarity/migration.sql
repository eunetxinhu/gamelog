-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'GG');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GG';

-- AlterTable
ALTER TABLE "activity_likes" DROP CONSTRAINT "activity_likes_pkey",
ADD COLUMN     "type" "ReactionType" NOT NULL DEFAULT 'LIKE',
ADD CONSTRAINT "activity_likes_pkey" PRIMARY KEY ("activity_id", "user_id", "type");

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "platinum_rarity" DOUBLE PRECISION,
ADD COLUMN     "platinum_rarity_checked_at" TIMESTAMP(3);

