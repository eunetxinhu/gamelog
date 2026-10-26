import "server-only";
import { prisma } from "@/lib/prisma";
import { topGenres } from "@/lib/taste";

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true, genres: true } as const;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Anos (do mais novo para o mais velho) em que a pessoa teve atividade. */
export async function wrappedYears(userId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ y: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS y
    FROM activities WHERE user_id = ${userId}::uuid ORDER BY y DESC`;
  return rows.map((r) => r.y);
}

/**
 * Retrospectiva do ano: o que a pessoa começou, terminou e platinou, as melhores notas,
 * os gêneros, o mês mais movimentado e a publicação mais curtida. Datas no fuso de Brasília.
 */
export async function getWrapped(userId: string, year: number) {
  // Meia-noite de 1º de janeiro em Brasília (UTC−3, sem horário de verão desde 2019)
  const from = new Date(`${year}-01-01T03:00:00Z`);
  const to = new Date(`${year + 1}-01-01T03:00:00Z`);
  const inYear = { gte: from, lt: to };

  const [activities, platinumEntries, logs, newFollowers] = await Promise.all([
    prisma.activity.findMany({
      where: { userId, createdAt: inYear },
      select: { id: true, type: true, createdAt: true, review: true, game: { select: gameSelect }, _count: { select: { likes: true, comments: true } } },
    }),
    prisma.libraryEntry.findMany({ where: { userId, platinumAt: inYear }, select: { game: { select: gameSelect } } }),
    prisma.gameLog.findMany({ where: { userId, updatedAt: inYear, rating: { not: null } }, select: { rating: true, game: { select: gameSelect } } }),
    prisma.follow.count({ where: { followingId: userId, status: "ACCEPTED", createdAt: inYear } }),
  ]);

  const uniq = <T extends { id: string }>(list: T[]) => [...new Map(list.map((g) => [g.id, g])).values()];
  const ofType = (...types: string[]) => uniq(activities.filter((a) => types.includes(a.type)).map((a) => a.game));
  const started = ofType("STARTED_GAME");
  const completed = ofType("COMPLETED", "PLATINUM");
  const platinums = uniq([...ofType("PLATINUM"), ...platinumEntries.map((p) => p.game)]);
  const reviews = activities.filter((a) => a.review?.trim()).length;
  const played = uniq(activities.map((a) => a.game));

  const byMonth = new Array(12).fill(0) as number[];
  for (const a of activities) {
    const m = Number(new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: "America/Sao_Paulo" }).format(a.createdAt)) - 1;
    byMonth[m] += 1;
  }
  const bestMonthIndex = byMonth.some((n) => n > 0) ? byMonth.indexOf(Math.max(...byMonth)) : null;

  const topRated = [...logs].sort((a, b) => b.rating! - a.rating!).slice(0, 5).map((l) => ({ game: l.game, rating: l.rating! }));
  const mostLiked = [...activities].sort((a, b) => b._count.likes + b._count.comments - (a._count.likes + a._count.comments))[0];

  return {
    year,
    empty: activities.length === 0 && platinumEntries.length === 0,
    posts: activities.length,
    played: played.length,
    started: started.length,
    completed: completed.length,
    platinums,
    reviews,
    newFollowers,
    genres: topGenres(played.map((g) => ({ genres: g.genres, minutes: 60 })), 3),
    byMonth,
    bestMonth: bestMonthIndex === null ? null : { name: MONTHS[bestMonthIndex], posts: byMonth[bestMonthIndex] },
    topRated,
    mostLiked: mostLiked && mostLiked._count.likes + mostLiked._count.comments > 0 ? { id: mostLiked.id, game: mostLiked.game, likes: mostLiked._count.likes, comments: mostLiked._count.comments } : null,
    covers: played.slice(0, 8),
  };
}

export type Wrapped = Awaited<ReturnType<typeof getWrapped>>;
