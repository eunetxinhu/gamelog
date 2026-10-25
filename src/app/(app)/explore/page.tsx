import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Flame, Search, Star, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { blockedIds } from "@/lib/privacy";
import { formatPlaytime } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { GameCover } from "@/components/game-cover";
import { SteamFriends } from "./_components/steam-friends";

export const metadata: Metadata = { title: "Explorar · GameLog" };

/** Mínimo de notas para entrar em "Mais bem avaliados" (evita um 5★ solitário no topo). */
const MIN_RATINGS = 2;

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;
type GameTileData = Prisma.GameGetPayload<{ select: typeof gameSelect }>;

type Props = { searchParams: Promise<{ q?: string }> };

export default async function ExplorePage({ searchParams }: Props) {
  const q = ((await searchParams).q ?? "").trim().replace(/^@/, "");
  const viewer = await getCurrentUser();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-zinc-50">Explorar</h1>
      <p className="mb-5 text-sm text-zinc-400">Encontre jogadores e veja o que a comunidade está jogando.</p>

      <form action="/explore" className="mb-8 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Buscar pessoas
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/30">
          <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Buscar pessoas por nome ou @usuario"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500">
          Buscar
        </button>
      </form>

      {!q && viewer?.steamId && (
        <Suspense fallback={<div className="mb-10 h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
          <SteamFriends viewerId={viewer.id} steamId={viewer.steamId} />
        </Suspense>
      )}
      {q ? <PeopleResults q={q} viewerId={viewer?.id ?? null} /> : <Discover viewerId={viewer?.id ?? null} />}
    </main>
  );
}

// =============================================================================
//  Busca de pessoas
// =============================================================================

async function PeopleResults({ q, viewerId }: { q: string; viewerId: string | null }) {
  const people = await prisma.user.findMany({
    where: {
      bannedAt: null,
      id: { notIn: await blockedIds(viewerId) },
      OR: [{ username: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }],
    },
    orderBy: { followers: { _count: "desc" } },
    take: 30,
    select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, bio: true, isPrivate: true, _count: { select: { followers: { where: { status: "ACCEPTED" } } } } },
  });

  if (people.length === 0) return <p className="text-sm text-zinc-500">Ninguém encontrado para “{q}”.</p>;
  return <PeopleList people={people} viewerId={viewerId} />;
}

async function PeopleList({
  people,
  viewerId,
}: {
  people: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    steamAvatarUrl: string | null;
    bio: string | null;
    isPrivate: boolean;
    _count: { followers: number };
  }[];
  viewerId: string | null;
}) {
  const followState = new Map(
    viewerId
      ? (
          await prisma.follow.findMany({
            where: { followerId: viewerId, followingId: { in: people.map((p) => p.id) } },
            select: { followingId: true, status: true },
          })
        ).map((f) => [f.followingId, f.status] as const)
      : [],
  );

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {people.map((p) => {
        const name = p.displayName ?? p.username;
        return (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={name} src={p.avatarUrl ?? p.steamAvatarUrl} size="md" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-zinc-100">{name}</span>
                <span className="block truncate text-xs text-zinc-500">
                  @{p.username} · {p._count.followers} {p._count.followers === 1 ? "seguidor" : "seguidores"}
                </span>
                {p.bio && <span className="mt-0.5 line-clamp-1 block text-xs text-zinc-400">{p.bio}</span>}
              </span>
            </Link>
            {viewerId && viewerId !== p.id && <FollowButton userId={p.id} state={followState.get(p.id) ?? null} isPrivate={p.isPrivate} />}
          </li>
        );
      })}
    </ul>
  );
}

// =============================================================================
//  Descobrir (sem busca)
// =============================================================================

async function Discover({ viewerId }: { viewerId: string | null }) {
  const [trendingRaw, platinumRaw, topRatedRaw, players] = await Promise.all([
    // Em alta: quantas pessoas jogaram nas últimas 2 semanas (dado da Steam)
    prisma.libraryEntry.groupBy({
      by: ["gameId"],
      where: { playtime2WeeksMinutes: { gt: 0 } },
      _count: { userId: true },
      _sum: { playtime2WeeksMinutes: true },
      orderBy: [{ _count: { userId: "desc" } }, { _sum: { playtime2WeeksMinutes: "desc" } }],
      take: 12,
    }),
    // Mais platinados: marcados no perfil + detectados na Steam, uma vez por pessoa
    prisma.$queryRaw<{ game_id: string; n: bigint }[]>`
      SELECT game_id, count(DISTINCT user_id) AS n FROM (
        SELECT user_id, game_id FROM game_logs WHERE status = 'PLATINUM'
        UNION
        SELECT user_id, game_id FROM library_entries WHERE platinum_at IS NOT NULL
      ) t
      GROUP BY game_id ORDER BY n DESC LIMIT 12`,
    prisma.gameLog.groupBy({
      by: ["gameId"],
      where: { rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
      having: { rating: { _count: { gte: MIN_RATINGS } } },
      orderBy: [{ _avg: { rating: "desc" } }, { _count: { rating: "desc" } }],
      take: 12,
    }),
    prisma.user.findMany({
      where: { bannedAt: null, id: { notIn: [...(viewerId ? [viewerId] : []), ...(await blockedIds(viewerId))] } },
      orderBy: [{ followers: { _count: "desc" } }, { activities: { _count: "desc" } }],
      take: 6,
      select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, bio: true, isPrivate: true, _count: { select: { followers: { where: { status: "ACCEPTED" } } } } },
    }),
  ]);

  const ids = [...new Set([...trendingRaw.map((t) => t.gameId), ...platinumRaw.map((p) => p.game_id), ...topRatedRaw.map((r) => r.gameId)])];
  const games = new Map((await prisma.game.findMany({ where: { id: { in: ids } }, select: gameSelect })).map((g) => [g.id, g]));

  const trending = trendingRaw.flatMap((t) => {
    const game = games.get(t.gameId);
    const n = t._count.userId;
    return game ? [{ game, sub: n > 1 ? `${n} jogando` : `${formatPlaytime(t._sum.playtime2WeeksMinutes ?? 0)} na semana` }] : [];
  });
  const platinums = platinumRaw.flatMap((p) => {
    const game = games.get(p.game_id);
    const n = Number(p.n);
    return game ? [{ game, sub: `${n} ${n === 1 ? "platina" : "platinas"}` }] : [];
  });
  const topRated = topRatedRaw.flatMap((r) => {
    const game = games.get(r.gameId);
    return game ? [{ game, sub: `★ ${(r._avg.rating ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} · ${r._count.rating} notas` }] : [];
  });

  const empty = trending.length + platinums.length + topRated.length + players.length === 0;
  if (empty) return <p className="text-sm text-zinc-500">Ainda não há atividade suficiente. Volte quando mais gente estiver jogando!</p>;

  return (
    <div className="space-y-10">
      {trending.length > 0 && (
        <Shelf title="Em alta esta semana" icon={<Flame className="size-4 text-orange-400" aria-hidden />} items={trending} />
      )}
      {platinums.length > 0 && (
        <Shelf title="Mais platinados" icon={<Trophy className="size-4 text-amber-400" aria-hidden />} items={platinums} />
      )}
      {topRated.length > 0 && (
        <Shelf title="Mais bem avaliados" icon={<Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />} items={topRated} />
      )}
      {players.length > 0 && (
        <section>
          <SectionTitle icon={<Users className="size-4 text-sky-400" aria-hidden />}>Jogadores em destaque</SectionTitle>
          <PeopleList people={players} viewerId={viewerId} />
        </section>
      )}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-50">
      {icon}
      {children}
    </h2>
  );
}

function Shelf({ title, icon, items }: { title: string; icon: ReactNode; items: { game: GameTileData; sub: string }[] }) {
  return (
    <section>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {items.map(({ game, sub }) => (
          <li key={game.id}>
            <Link href={`/games/${game.slug}`} className="group block space-y-1.5">
              <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} className="transition group-hover:ring-sky-500" />
              <p className="line-clamp-2 text-xs font-medium text-zinc-200 group-hover:text-white">{game.title}</p>
              <p className="text-[11px] text-zinc-500">{sub}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
