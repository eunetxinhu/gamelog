-- AlterTable
ALTER TABLE "games" ADD COLUMN     "developers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hero_url" TEXT,
ADD COLUMN     "media_synced_at" TIMESTAMP(3),
ADD COLUMN     "metacritic_score" SMALLINT,
ADD COLUMN     "metacritic_url" TEXT,
ADD COLUMN     "publishers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "screenshots" JSONB,
ADD COLUMN     "trailers" JSONB;

