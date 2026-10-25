import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSteamForUser } from "@/lib/steam/sync";

/** Limite da função na Vercel (plano Hobby: até 60 s). */
export const maxDuration = 60;

/** Para de pegar usuários novos com essa folga antes do limite. */
const BUDGET_MS = 48_000;
/** Quem sincronizou há menos que isso (botão ou automático) fica de fora. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * Sincronização diária de todo mundo que tem Steam vinculada (Vercel Cron, ver vercel.json).
 * Faz o feed andar mesmo para quem não abriu o site. A Vercel envia
 * `Authorization: Bearer $CRON_SECRET` sozinha quando a variável existe.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const users = await prisma.user.findMany({
    where: {
      steamId: { not: null },
      OR: [{ steamLastSyncAt: null }, { steamLastSyncAt: { lt: new Date(started - STALE_AFTER_MS) } }],
    },
    orderBy: { steamLastSyncAt: { sort: "asc", nulls: "first" } },
    take: 200,
    select: { id: true, username: true, steamId: true, steamLastSyncAt: true },
  });

  const summary = { candidates: users.length, synced: 0, failed: 0, skipped: 0, platinums: 0, started: 0 };
  for (const user of users) {
    if (Date.now() - started > BUDGET_MS) {
      summary.skipped = users.length - summary.synced - summary.failed;
      break;
    }
    const res = await syncSteamForUser(user);
    if (res.ok) {
      summary.synced++;
      summary.platinums += res.data.posted.platinums;
      summary.started += res.data.posted.started;
    } else {
      summary.failed++;
      if (res.error.code !== "STEAM_PRIVATE") console.warn("[cron] sync falhou", user.username, res.error.code);
    }
  }

  console.log("[cron] steam-sync", { ...summary, ms: Date.now() - started });
  return NextResponse.json(summary);
}
