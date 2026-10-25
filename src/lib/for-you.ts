import "server-only";
import { prisma } from "@/lib/prisma";
import { getActivities, type FeedItem } from "@/lib/activity";
import { visibleUsersWhere } from "@/lib/privacy";
import { rankForYou, trendScore } from "@/lib/trending";

/** Janela da aba "Para você" e quantas candidatas olhar (comunidade pequena: sobra folga). */
const WINDOW_DAYS = 7;
const CANDIDATES = 600;
export const FOR_YOU_PAGE = 20;

/**
 * Publicações populares da semana de quem a pessoa ainda não segue (nem ela mesma),
 * respeitando privacidade, bloqueios e suspensões. `page` começa em 0.
 */
export async function getForYou(viewerId: string, followingIds: string[], page = 0): Promise<{ items: FeedItem[]; hasMore: boolean }> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const rows = await prisma.activity.findMany({
    where: {
      createdAt: { gte: since },
      userId: { notIn: [viewerId, ...followingIds] },
      user: await visibleUsersWhere(viewerId),
    },
    orderBy: { createdAt: "desc" },
    take: CANDIDATES,
    select: { id: true, userId: true, createdAt: true, review: true, images: true, imageUrl: true, _count: { select: { likes: true, comments: true } } },
  });

  const now = Date.now();
  const ranked = rankForYou(
    rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      score: trendScore({
        reactions: r._count.likes,
        comments: r._count.comments,
        hasContent: Boolean(r.review?.trim()) || r.images.length > 0 || Boolean(r.imageUrl),
        ageHours: (now - r.createdAt.getTime()) / 3_600_000,
      }),
    })),
  );

  const ids = ranked.slice(page * FOR_YOU_PAGE, (page + 1) * FOR_YOU_PAGE).map((r) => r.id);
  if (ids.length === 0) return { items: [], hasMore: false };
  const items = await getActivities({ where: { id: { in: ids } }, viewerId, take: ids.length });
  const order = new Map(ids.map((id, i) => [id, i]));
  items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { items, hasMore: ranked.length > (page + 1) * FOR_YOU_PAGE };
}
