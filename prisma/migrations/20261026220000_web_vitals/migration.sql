-- Desempenho real medido no navegador (Web Vitals), por página.

-- CreateTable
CREATE TABLE "web_vitals" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(8) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "route" VARCHAR(120) NOT NULL,
    "device" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_vitals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_vitals_created_at_idx" ON "web_vitals"("created_at");
CREATE INDEX "web_vitals_route_name_created_at_idx" ON "web_vitals"("route", "name", "created_at");

-- Manual: só o servidor grava/lê
ALTER TABLE "web_vitals" ENABLE ROW LEVEL SECURITY;
