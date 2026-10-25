import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSteamForUser } from "@/lib/steam/sync";
import { RETRY_AFTER_ERROR, SYNC_INTERVAL } from "@/lib/steam/schedule";
import { isCronRequest } from "@/lib/cron";

/** Limite da função na Vercel (plano Hobby: até 60 s). */
export const maxDuration = 60;

/** Para de pegar usuários novos com essa folga antes do limite. */
const BUDGET_MS = 48_000;

/**
 * Sincronização escalonada da Steam: cada pessoa tem um `steamNextSyncAt`, calculado
 * no fim da sincronização conforme a atividade (ver lib/steam/schedule.ts):
 *  - jogou nas últimas 2 semanas ou visitou o site há pouco → a cada 3 h
 *  - normal → 1x por dia
 *  - sem jogar nem visitar há um mês → a cada 3 dias
 *
 * Este endpoint só pega quem está "vencido", então pode ser chamado com a frequência
 * que o plano permitir: a Vercel Hobby chama 1x por dia (vercel.json) e o GitHub
 * Actions chama de hora em hora (.github/workflows/steam-sync.yml).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const started = Date.now();
  const now = new Date(started);
  const users = await prisma.user.findMany({
    where: { steamId: { not: null }, OR: [{ steamNextSyncAt: null }, { steamNextSyncAt: { lte: now } }] },
    orderBy: { steamNextSyncAt: { sort: "asc", nulls: "first" } },
    take: 150,
    select: { id: true, username: true, steamId: true, steamLastSyncAt: true, lastSeenAt: true },
  });

  const summary = { due: users.length, synced: 0, failed: 0, skipped: 0, platinums: 0, started: 0 };
  for (const user of users) {
    if (Date.now() - started > BUDGET_MS) {
      summary.skipped = users.length - summary.synced - summary.failed;
      break;
    }
    const res = await syncSteamForUser(user);
    if (res.ok) {
      // steamNextSyncAt já foi gravado pela sincronização
      summary.synced++;
      summary.platinums += res.data.posted.platinums;
      summary.started += res.data.posted.started;
      continue;
    }

    summary.failed++;
    const code = res.error.code;
    // Perfil privado / conta sumiu: depende da pessoa, tenta 1x por dia.
    // Cooldown: sincronizou agora há pouco pelo site. Resto (Steam fora): de novo em 1 h.
    const wait =
      code === "STEAM_PRIVATE" || code === "STEAM_NOT_FOUND"
        ? SYNC_INTERVAL.REGULAR
        : code === "SYNC_COOLDOWN"
          ? (res.error.retryAfterSeconds ?? 300) * 1000
          : RETRY_AFTER_ERROR;
    await prisma.user.update({ where: { id: user.id }, data: { steamNextSyncAt: new Date(Date.now() + wait) } });
    if (code !== "STEAM_PRIVATE" && code !== "SYNC_COOLDOWN") console.warn("[cron] sync falhou", user.username, code);
  }

  console.log("[cron] steam-sync", { ...summary, ms: Date.now() - started });
  return NextResponse.json(summary);
}
