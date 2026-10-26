"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { searchGames } from "@/lib/catalog";
import { searchUserIds } from "@/lib/search";
import { clientIpHash, rateLimit } from "@/lib/rate-limit";
import { visibleUsersWhere } from "@/lib/privacy";

export type SearchHit =
  | { kind: "game"; href: string; title: string; sub: string | null; coverUrl: string | null; steamAppId: number | null }
  | { kind: "person"; href: string; title: string; sub: string; avatar: string | null }
  | { kind: "list"; href: string; title: string; sub: string }
  | { kind: "club"; href: string; title: string; sub: string; imageUrl: string | null };

/** Busca única do topo (Ctrl+K): jogos, pessoas, listas e clubes de uma vez. */
export async function globalSearch(raw: string): Promise<SearchHit[]> {
  const q = String(raw ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const user = await getCurrentUser();
  if (!(await rateLimit("search", user?.id ?? (await clientIpHash()))).ok) return [];
  const viewerId = user?.id ?? null;
  const visible = await visibleUsersWhere(viewerId);

  const [games, personIds, lists, clubs] = await Promise.all([
    searchGames(q).then((r) => r.results.slice(0, 5)).catch(() => []),
    searchUserIds(q, viewerId, 5).catch(() => []),
    prisma.gameList.findMany({
      where: { title: { contains: q, mode: "insensitive" }, user: visible, items: { some: {} } },
      orderBy: { likes: { _count: "desc" } },
      take: 4,
      select: { id: true, title: true, user: { select: { username: true } }, _count: { select: { items: true } } },
    }),
    prisma.club.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { members: { _count: "desc" } },
      take: 4,
      select: { slug: true, name: true, imageUrl: true, _count: { select: { members: true } } },
    }),
  ]);
  const people = personIds.length
    ? await prisma.user.findMany({ where: { id: { in: personIds } }, select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } })
    : [];
  const peopleOrdered = personIds.flatMap((id) => people.filter((p) => p.id === id));

  return [
    ...games.map((g): SearchHit => ({ kind: "game", href: `/games/${g.slug}`, title: g.title, sub: g.year ? String(g.year) : null, coverUrl: g.coverUrl, steamAppId: g.steamAppId })),
    ...peopleOrdered.map((p): SearchHit => ({ kind: "person", href: `/u/${p.username}`, title: p.displayName ?? p.username, sub: `@${p.username}`, avatar: p.avatarUrl ?? p.steamAvatarUrl })),
    ...lists.map((l): SearchHit => ({ kind: "list", href: `/listas/${l.id}`, title: l.title, sub: `Lista de @${l.user.username} · ${l._count.items} jogos` })),
    ...clubs.map((c): SearchHit => ({ kind: "club", href: `/clubes/${c.slug}`, title: c.name, sub: `${c._count.members} ${c._count.members === 1 ? "membro" : "membros"}`, imageUrl: c.imageUrl })),
  ];
}
