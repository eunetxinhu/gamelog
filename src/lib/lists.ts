import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { visibleUsersWhere } from "@/lib/privacy";

/** Capas que aparecem empilhadas no card da lista. */
const PREVIEW_COVERS = 5;

const cardInclude = {
  user: { select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, title: true } },
  items: {
    orderBy: { position: "asc" },
    take: PREVIEW_COVERS,
    select: { game: { select: { slug: true, title: true, coverUrl: true, steamAppId: true } } },
  },
  _count: { select: { items: true, likes: true, comments: true } },
} satisfies Prisma.GameListInclude;

export type ListCardData = {
  id: string;
  title: string;
  description: string | null;
  ranked: boolean;
  updatedAt: Date;
  author: { username: string; name: string; avatar: string | null; title: string | null };
  covers: { slug: string; title: string; coverUrl: string | null; steamAppId: number | null }[];
  itemCount: number;
  likeCount: number;
  commentCount: number;
};

function toCard(l: Prisma.GameListGetPayload<{ include: typeof cardInclude }>): ListCardData {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    ranked: l.ranked,
    updatedAt: l.updatedAt,
    author: {
      username: l.user.username,
      name: l.user.displayName ?? l.user.username,
      avatar: l.user.avatarUrl ?? l.user.steamAvatarUrl,
      title: l.user.title,
    },
    covers: l.items.map((i) => i.game),
    itemCount: l._count.items,
    likeCount: l._count.likes,
    commentCount: l._count.comments,
  };
}

/** Listas que o visitante pode ver (autor público ou seguido, sem bloqueio, não suspenso). */
export async function getListCards(opts: {
  viewerId: string | null;
  where?: Prisma.GameListWhereInput;
  orderBy?: Prisma.GameListOrderByWithRelationInput[];
  take?: number;
}): Promise<ListCardData[]> {
  const visible = await visibleUsersWhere(opts.viewerId);
  const rows = await prisma.gameList.findMany({
    where: { AND: [opts.where ?? {}, { user: visible }, { items: { some: {} } }] },
    orderBy: opts.orderBy ?? [{ updatedAt: "desc" }],
    take: opts.take ?? 24,
    include: cardInclude,
  });
  return rows.map(toCard);
}

/** Populares: mais curtidas nos últimos 30 dias (e, empatando, no total). */
export async function getPopularLists(viewerId: string | null, take = 12): Promise<ListCardData[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const recent = await prisma.gameListLike.groupBy({
    by: ["listId"],
    where: { createdAt: { gte: since } },
    _count: { listId: true },
    orderBy: { _count: { listId: "desc" } },
    take: 60,
  });
  if (recent.length === 0) return [];
  const cards = await getListCards({ viewerId, where: { id: { in: recent.map((r) => r.listId) } }, take: 60 });
  const rank = new Map(recent.map((r, i) => [r.listId, i]));
  return cards.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) || b.likeCount - a.likeCount).slice(0, take);
}

/** Lista completa para a página dela, ou null se não existir / o visitante não puder ver. */
export async function getListForViewer(id: string, viewerId: string | null) {
  const visible = await visibleUsersWhere(viewerId);
  const list = await prisma.gameList.findFirst({
    where: { id, user: visible },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, title: true } },
      items: {
        orderBy: { position: "asc" },
        select: { note: true, position: true, game: { select: { id: true, slug: true, title: true, coverUrl: true, steamAppId: true, releaseDate: true } } },
      },
      _count: { select: { likes: true } },
      likes: { where: { userId: viewerId ?? "00000000-0000-0000-0000-000000000000" }, select: { userId: true } },
    },
  });
  if (!list) return null;
  const comments = await prisma.gameListComment.findMany({
    where: { listId: id, user: visible },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, body: true, createdAt: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, title: true } } },
  });
  return { ...list, likedByMe: list.likes.length > 0, likeCount: list._count.likes, comments };
}
