import "server-only";
import { prisma } from "@/lib/prisma";
import { enrichFromSteam, refreshFromRawg } from "@/lib/catalog";
import { notifyMany } from "@/lib/notifications";
import { groupReleases, RECENT_DAYS, type ReleaseItem } from "@/lib/release-calendar";
import { isoDay, todayInSaoPaulo } from "@/lib/steam/dates";

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;
export type ReleaseGame = { id: string; slug: string; title: string; coverUrl: string | null; steamAppId: number | null };

/** Dia "AAAA-MM-DD" → Date à meia-noite UTC (como as datas de lançamento ficam no banco). */
const dayToDate = (day: string) => new Date(`${day}T00:00:00Z`);
const addDays = (day: string, n: number) => isoDay(new Date(dayToDate(day).getTime() + n * 86_400_000));

/** Calendário da wishlist de alguém: hoje, próximos por mês, sem data exata e recém-lançados. */
export async function getWishlistReleases(userId: string, now = new Date()) {
  const today = todayInSaoPaulo(now);
  const rows = await prisma.wishlistItem.findMany({
    where: {
      userId,
      game: { OR: [{ comingSoon: true }, { releaseDate: { gte: dayToDate(addDays(today, -RECENT_DAYS)) } }] },
    },
    select: { game: { select: { ...gameSelect, releaseDate: true, comingSoon: true, releaseDateText: true } } },
  });
  const items: ReleaseItem<ReleaseGame>[] = rows.map(({ game: { releaseDate, comingSoon, releaseDateText, ...game } }) => ({
    game,
    day: releaseDate ? isoDay(releaseDate) : null,
    comingSoon,
    text: releaseDateText,
  }));
  return { today, calendar: groupReleases(items, today), total: await prisma.wishlistItem.count({ where: { userId } }) };
}

/** Quantos jogos da wishlist lançam nos próximos 7 dias (selo no menu / perfil). */
export async function upcomingWishlistCount(userId: string, now = new Date()) {
  const today = todayInSaoPaulo(now);
  return prisma.wishlistItem.count({
    where: { userId, game: { releaseDate: { gte: dayToDate(today), lte: dayToDate(addDays(today, 7)) } } },
  });
}

/**
 * Cron diário: confere de novo na loja os jogos de wishlist que ainda vão lançar,
 * porque a data muda (adiamentos, "Em breve" que vira dia exato). Poucos por vez.
 */
export async function refreshUpcomingReleases(limit = 20) {
  const stale = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const today = todayInSaoPaulo();
  const games = await prisma.game.findMany({
    where: {
      wishlistedBy: { some: {} },
      OR: [{ comingSoon: true }, { releaseDate: { gte: dayToDate(addDays(today, -1)) } }],
      AND: [{ OR: [{ syncedAt: null }, { syncedAt: { lt: stale } }] }],
    },
    orderBy: { releaseDate: { sort: "asc", nulls: "last" } },
    take: limit,
    select: { id: true, steamAppId: true, rawgId: true, coverUrl: true },
  });

  let refreshed = 0;
  for (let i = 0; i < games.length; i += 5) {
    const batch = games.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((g) =>
        g.steamAppId ? enrichFromSteam(g.id, g.steamAppId, g.coverUrl) : g.rawgId ? refreshFromRawg(g.id, g.rawgId) : Promise.resolve(null),
      ),
    );
    refreshed += results.filter((r) => r.status === "fulfilled" && r.value).length;
  }
  return { candidates: games.length, refreshed };
}

/**
 * Cron diário (06h de Brasília): avisa, por notificação e push, quem tem na wishlist
 * um jogo que lançou hoje. Pega também os 2 dias anteriores caso o cron tenha falhado.
 * Um aviso por pessoa e jogo (wishlist_items.release_notified_at).
 */
export async function notifyReleases(now = new Date()) {
  const today = todayInSaoPaulo(now);
  const due = await prisma.wishlistItem.findMany({
    where: {
      releaseNotifiedAt: null,
      game: { releaseDate: { gte: dayToDate(addDays(today, -2)), lte: dayToDate(today) } },
    },
    select: { userId: true, gameId: true },
  });
  if (due.length === 0) return { notified: 0 };

  await prisma.$transaction(
    due.map((d) =>
      prisma.wishlistItem.update({ where: { userId_gameId: { userId: d.userId, gameId: d.gameId } }, data: { releaseNotifiedAt: now } }),
    ),
  );
  await notifyMany(due.map((d) => ({ userId: d.userId, type: "RELEASE" as const, gameId: d.gameId })));
  return { notified: due.length };
}
