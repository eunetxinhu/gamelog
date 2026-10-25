import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notifications";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;

/**
 * Resumo dos últimos 7 dias. As horas vêm da Steam, que só informa as últimas
 * 2 semanas, então a UI deixa isso explícito.
 */
export async function getWeeklySummary(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - WEEK_MS);

  const [activities, likes, ggs, followers, topGames] = await Promise.all([
    prisma.activity.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { type: true, game: { select: gameSelect } },
    }),
    prisma.activityLike.count({ where: { type: "LIKE", createdAt: { gte: since }, activity: { userId } } }),
    prisma.activityLike.count({ where: { type: "GG", createdAt: { gte: since }, activity: { userId } } }),
    prisma.follow.count({ where: { followingId: userId, status: "ACCEPTED", createdAt: { gte: since } } }),
    prisma.libraryEntry.findMany({
      where: { userId, playtime2WeeksMinutes: { gt: 0 } },
      orderBy: { playtime2WeeksMinutes: "desc" },
      take: 3,
      select: { playtime2WeeksMinutes: true, game: { select: gameSelect } },
    }),
  ]);

  const ofType = (t: string) => activities.filter((a) => a.type === t).map((a) => a.game);
  const started = ofType("STARTED_GAME");
  const completed = ofType("COMPLETED");
  const platinums = ofType("PLATINUM");
  const reviews = ofType("REVIEW");
  const hours2Weeks = Math.round(topGames.reduce((n, g) => n + g.playtime2WeeksMinutes, 0) / 60);

  return {
    since,
    until: now,
    started,
    completed,
    platinums,
    reviews,
    likes,
    ggs,
    followers,
    hours2Weeks,
    topGames: topGames.map((g) => ({ game: g.game, hours: Math.round((g.playtime2WeeksMinutes / 60) * 10) / 10 })),
    hasContent: activities.length + likes + ggs + followers + topGames.length > 0,
  };
}

export type WeeklySummary = Awaited<ReturnType<typeof getWeeklySummary>>;

/**
 * Segunda-feira (UTC): avisa quem teve movimento na semana que o resumo está pronto.
 * Idempotente: não repete se já avisou nos últimos 6 dias. Chamado pelo cron diário.
 */
export async function notifyWeeklySummaries(now = new Date()) {
  if (now.getUTCDay() !== 1) return { notified: 0 };
  const since = new Date(now.getTime() - WEEK_MS);

  const active = await prisma.user.findMany({
    where: {
      OR: [
        { activities: { some: { createdAt: { gte: since } } } },
        { library: { some: { playtime2WeeksMinutes: { gt: 0 } } } },
        { followers: { some: { status: "ACCEPTED", createdAt: { gte: since } } } },
      ],
      notifications: { none: { type: "WEEKLY", createdAt: { gte: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000) } } },
    },
    select: { id: true },
  });
  if (active.length === 0) return { notified: 0 };

  await notifyMany(active.map((u) => ({ userId: u.id, type: "WEEKLY" as const })));
  return { notified: active.length };
}
