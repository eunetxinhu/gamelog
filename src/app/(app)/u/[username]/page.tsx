import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActivities } from "@/lib/activity";
import { formatPlaytime, STATUS_LABEL } from "@/lib/format";
import { ActivityCard } from "@/components/activity-card";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { GameCover } from "@/components/game-cover";

type Props = { params: Promise<{ username: string }> };

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)} · GameLog` };
}

export default async function ProfilePage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const [profile, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      include: { _count: { select: { followers: true, following: true } } },
    }),
    getCurrentUser(),
  ]);
  if (!profile) notFound();

  const isMe = viewer?.id === profile.id;

  const [following, library, completedCount, platinumLogs, steamPlatinums, recent, playingLogs, mostPlayed, activities, favorites] =
    await Promise.all([
      viewer && !isMe
        ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: profile.id } } })
        : null,
      prisma.libraryEntry.aggregate({ where: { userId: profile.id }, _count: { _all: true }, _sum: { playtimeMinutes: true } }),
      prisma.gameLog.count({ where: { userId: profile.id, status: "COMPLETED" } }),
      prisma.gameLog.findMany({
        where: { userId: profile.id, status: "PLATINUM" },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true, finishedAt: true, game: { select: gameSelect } },
      }),
      prisma.libraryEntry.findMany({
        where: { userId: profile.id, platinumAt: { not: null } },
        orderBy: { platinumAt: "desc" },
        select: { platinumAt: true, game: { select: gameSelect } },
      }),
      prisma.libraryEntry.findMany({
        where: { userId: profile.id, playtime2WeeksMinutes: { gt: 0 } },
        orderBy: { playtime2WeeksMinutes: "desc" },
        take: 6,
        select: { playtime2WeeksMinutes: true, game: { select: gameSelect } },
      }),
      prisma.gameLog.findMany({
        where: { userId: profile.id, status: "PLAYING" },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { game: { select: gameSelect } },
      }),
      prisma.libraryEntry.findMany({
        where: { userId: profile.id, playtimeMinutes: { gt: 0 } },
        orderBy: { playtimeMinutes: "desc" },
        take: 12,
        select: { playtimeMinutes: true, achievementsUnlocked: true, achievementsTotal: true, game: { select: gameSelect } },
      }),
      getActivities({ where: { userId: profile.id }, viewerId: viewer?.id ?? null, take: 20 }),
      prisma.favoriteGame.findMany({ where: { userId: profile.id }, orderBy: { position: "asc" }, select: { game: { select: gameSelect } } }),
    ]);

  // Platinas: marcadas no perfil + detectadas na Steam (sem repetir o jogo)
  const platinums = new Map<string, { game: (typeof steamPlatinums)[number]["game"]; at: Date }>();
  for (const p of steamPlatinums) platinums.set(p.game.id, { game: p.game, at: p.platinumAt! });
  for (const p of platinumLogs) if (!platinums.has(p.game.id)) platinums.set(p.game.id, { game: p.game, at: p.finishedAt ?? p.updatedAt });
  const platinumList = [...platinums.values()].sort((a, b) => b.at.getTime() - a.at.getTime());

  // Jogando agora: horas recentes na Steam + marcados como "Jogando"
  const playing = new Map<string, { game: (typeof recent)[number]["game"]; sub: string }>();
  for (const r of recent) playing.set(r.game.id, { game: r.game, sub: `${formatPlaytime(r.playtime2WeeksMinutes)} em 2 semanas` });
  for (const l of playingLogs) if (!playing.has(l.game.id)) playing.set(l.game.id, { game: l.game, sub: STATUS_LABEL.PLAYING });

  const name = profile.displayName ?? profile.username;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* ---- Cabeçalho ------------------------------------------------------ */}
      <header className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="h-32 bg-gradient-to-br from-sky-900/60 via-zinc-900 to-violet-900/60 sm:h-44">
          {profile.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.bannerUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="-mt-12 w-fit rounded-full ring-4 ring-zinc-950">
            <Avatar name={name} src={profile.avatarUrl ?? profile.steamAvatarUrl} size="lg" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate text-2xl font-bold text-zinc-50">{name}</h1>
            <p className="text-sm text-zinc-400">@{profile.username}</p>
            {profile.bio && <p className="max-w-prose pt-1 text-sm text-zinc-300">{profile.bio}</p>}
            <p className="flex gap-4 pt-2 text-sm text-zinc-400">
              <span>
                <strong className="text-zinc-100">{profile._count.followers}</strong> seguidores
              </span>
              <span>
                <strong className="text-zinc-100">{profile._count.following}</strong> seguindo
              </span>
            </p>
          </div>
          <div className="shrink-0">
            {isMe ? (
              <Link
                href="/settings/account"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
              >
                <Settings className="size-4" aria-hidden /> Editar perfil
              </Link>
            ) : viewer ? (
              <FollowButton userId={profile.id} following={Boolean(following)} />
            ) : (
              <Link href={`/login?next=/u/${profile.username}`} className="text-sm text-sky-400 hover:underline">
                Entre para seguir
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ---- Top 4 ---------------------------------------------------------- */}
      {favorites.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Favoritos</h2>
          <ul className="grid grid-cols-4 gap-3 sm:gap-4">
            {favorites.map(({ game }) => (
              <li key={game.id}>
                <Link href={`/games/${game.slug}`} title={game.title} className="group block">
                  <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} className="transition group-hover:ring-sky-500" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Números -------------------------------------------------------- */}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Jogos" value={library._count._all.toLocaleString("pt-BR")} />
        <Stat label="Horas jogadas" value={Math.round((library._sum.playtimeMinutes ?? 0) / 60).toLocaleString("pt-BR")} />
        <Stat label="Finalizados" value={completedCount.toLocaleString("pt-BR")} />
        <Stat label="Platinas" value={platinumList.length.toLocaleString("pt-BR")} highlight />
      </dl>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* ---- Atividade ---------------------------------------------------- */}
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Atividade</h2>
          {activities.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
              {isMe ? (
                <>
                  Você ainda não publicou nada.{" "}
                  <Link href="/games" className="text-sky-400 hover:underline">
                    Compartilhe um jogo
                  </Link>
                  .
                </>
              ) : (
                "Nenhuma publicação ainda."
              )}
            </p>
          ) : (
            <div className="space-y-4">
              {activities.map((a) => (
                <ActivityCard key={a.id} item={a} viewerId={viewer?.id ?? null} />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-10">
          {playing.size > 0 && (
            <ShelfSection title="Jogando agora">
              {[...playing.values()].map(({ game, sub }) => (
                <Shelf key={game.id} game={game} sub={sub} />
              ))}
            </ShelfSection>
          )}

          {platinumList.length > 0 && (
            <ShelfSection title="Platinas" icon={<Trophy className="size-4 text-amber-400" aria-hidden />}>
              {platinumList.slice(0, 9).map(({ game }) => (
                <Shelf key={game.id} game={game} platinum />
              ))}
            </ShelfSection>
          )}

          {mostPlayed.length > 0 && (
            <ShelfSection title="Mais jogados">
              {mostPlayed.map((e) => (
                <Shelf
                  key={e.game.id}
                  game={e.game}
                  sub={[
                    formatPlaytime(e.playtimeMinutes),
                    e.achievementsTotal ? `${e.achievementsUnlocked ?? 0}/${e.achievementsTotal} 🏅` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </ShelfSection>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-zinc-800 bg-zinc-900/60"}`}>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold ${highlight ? "text-amber-300" : "text-zinc-50"}`}>{value}</dd>
    </div>
  );
}

function ShelfSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-50">
        {icon}
        {title}
      </h2>
      <ul className="grid grid-cols-3 gap-3">{children}</ul>
    </section>
  );
}

function Shelf({
  game,
  sub,
  platinum,
}: {
  game: { slug: string; title: string; coverUrl: string | null; steamAppId: number | null };
  sub?: string;
  platinum?: boolean;
}) {
  return (
    <li>
      <Link href={`/games/${game.slug}`} className="group block space-y-1" title={game.title}>
        <div className="relative">
          <GameCover
            title={game.title}
            coverUrl={game.coverUrl}
            steamAppId={game.steamAppId}
            className={platinum ? "ring-2 ring-amber-400/70" : "transition group-hover:ring-sky-500"}
          />
          {platinum && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-400 p-1 text-zinc-950 shadow">
              <Trophy className="size-3" aria-hidden />
            </span>
          )}
        </div>
        {sub && <p className="truncate text-[11px] text-zinc-400">{sub}</p>}
      </Link>
    </li>
  );
}
