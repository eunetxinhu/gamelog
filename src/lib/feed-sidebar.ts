import "server-only";
import { prisma } from "@/lib/prisma";
import { getPlayerSummaries } from "@/lib/steam/api";
import { nowPlayingFrom } from "@/lib/now-playing";
import { getWishlistReleases } from "@/lib/releases";
import { visibleUsersWhere } from "@/lib/privacy";

// Dados dos cards da lateral do feed. Cada função é independente e falha "vazia"
// (o card simplesmente não aparece), para nunca derrubar o feed.

const gameSelect = { slug: true, title: true, coverUrl: true, steamAppId: true } as const;
const personSelect = { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, steamId: true } as const;

export type NowPlayingItem = {
  user: { username: string; name: string; avatar: string | null };
  game: { appId: number; name: string; slug: string | null; coverUrl: string | null };
};

/** Quem eu sigo e está com um jogo aberto na Steam agora (a Steam fica em cache por 1 min). */
export async function getNowPlaying(viewerId: string, take = 6): Promise<NowPlayingItem[]> {
  try {
    const friends = await prisma.user.findMany({
      where: {
        AND: [{ steamId: { not: null } }, { followers: { some: { followerId: viewerId, status: "ACCEPTED" } } }, await visibleUsersWhere(viewerId)],
      },
      orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } },
      take: 100,
      select: personSelect,
    });
    if (friends.length === 0) return [];
    const r = await getPlayerSummaries(friends.map((f) => f.steamId!));
    if (!r.ok) return [];
    const playing = nowPlayingFrom(r.data, friends.map((f) => f.steamId!)).slice(0, take);
    const games = new Map(
      (await prisma.game.findMany({ where: { steamAppId: { in: playing.map((p) => p.appId) } }, select: gameSelect })).map((g) => [g.steamAppId!, g]),
    );
    const bySteam = new Map(friends.map((f) => [f.steamId!, f]));
    return playing.map((p) => {
      const u = bySteam.get(p.steamId)!;
      const g = games.get(p.appId);
      return {
        user: { username: u.username, name: u.displayName ?? u.username, avatar: u.avatarUrl ?? u.steamAvatarUrl },
        // Jogo que ainda não está no banco abre pela loja ("steam-<appId>") e usa a capa da Steam
        game: { appId: p.appId, name: g?.title ?? p.name, slug: g?.slug ?? `steam-${p.appId}`, coverUrl: g?.coverUrl ?? null },
      };
    });
  } catch {
    return [];
  }
}

/** Próximos lançamentos da wishlist: os de hoje primeiro, depois por data. */
export async function getUpcomingWishlist(userId: string, take = 3) {
  try {
    const { today, calendar } = await getWishlistReleases(userId);
    const items = [...calendar.today, ...calendar.upcoming.flatMap((m) => m.items)].slice(0, take);
    return items.map((i) => ({ game: i.game, day: i.day!, isToday: i.day === today }));
  } catch {
    return [];
  }
}

/** Jogos da wishlist em promoção na Steam, maior desconto primeiro. */
export async function getWishlistDeals(userId: string, take = 3) {
  try {
    const rows = await prisma.wishlistItem.findMany({
      where: { userId, game: { discountPercent: { gt: 0 } } },
      orderBy: { game: { discountPercent: "desc" } },
      take,
      select: { game: { select: { ...gameSelect, discountPercent: true, priceFinal: true, priceOriginal: true } } },
    });
    return rows.map((r) => r.game);
  } catch {
    return [];
  }
}

/** Clubes de que participo, os com post mais recente primeiro, e quantos posts tiveram nas últimas 24h. */
export async function getMyClubs(userId: string, take = 6) {
  try {
    const since = new Date(Date.now() - 86_400_000);
    const rows = await prisma.clubMember.findMany({
      where: { userId },
      take: 30,
      select: {
        club: {
          select: {
            slug: true,
            name: true,
            imageUrl: true,
            posts: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            _count: { select: { posts: { where: { createdAt: { gte: since } } } } },
          },
        },
      },
    });
    return rows
      .map(({ club }) => ({ slug: club.slug, name: club.name, imageUrl: club.imageUrl, lastPostAt: club.posts[0]?.createdAt ?? null, today: club._count.posts }))
      .sort((a, b) => (b.lastPostAt?.getTime() ?? 0) - (a.lastPostAt?.getTime() ?? 0))
      .slice(0, take);
  } catch {
    return [];
  }
}
