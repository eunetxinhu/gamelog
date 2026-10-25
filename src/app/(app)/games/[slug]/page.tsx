import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateGame } from "@/lib/catalog";
import { getActivities } from "@/lib/activity";
import { STATUS_LABEL } from "@/lib/format";
import { ActivityCard } from "@/components/activity-card";
import { Avatar } from "@/components/avatar";
import { GameCover } from "@/components/game-cover";
import { RatingStars } from "@/components/rating-stars";
import { LogForm } from "./_components/log-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = await prisma.game.findUnique({ where: { slug }, select: { title: true } });
  return { title: `${game?.title ?? "Jogo"} · GameLog` };
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const [game, viewer] = await Promise.all([getOrCreateGame(slug), getCurrentUser()]);
  if (!game) notFound();

  const [myLog, stats, platinums, playingNow, activities] = await Promise.all([
    viewer ? prisma.gameLog.findUnique({ where: { userId_gameId: { userId: viewer.id, gameId: game.id } } }) : null,
    prisma.gameLog.aggregate({ where: { gameId: game.id, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.gameLog.count({ where: { gameId: game.id, status: "PLATINUM" } }),
    prisma.gameLog.findMany({
      where: { gameId: game.id, status: "PLAYING" },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { user: { select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } } },
    }),
    getActivities({ where: { gameId: game.id }, viewerId: viewer?.id ?? null, take: 20 }),
  ]);

  const year = game.releaseDate?.getUTCFullYear();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="mx-auto w-44 md:w-full">
          <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} />
        </div>

        <div className="min-w-0 space-y-5">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-zinc-50">{game.title}</h1>
            <p className="text-sm text-zinc-400">
              {[year, game.genres.slice(0, 3).join(", "), game.platforms.slice(0, 4).join(" · ")].filter(Boolean).join(" — ")}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-300">
              {stats._count.rating > 0 && (
                <span className="flex items-center gap-2">
                  <RatingStars value={Math.round(stats._avg.rating ?? 0)} />
                  {(stats._avg.rating ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ·{" "}
                  {stats._count.rating} {stats._count.rating === 1 ? "nota" : "notas"}
                </span>
              )}
              {platinums > 0 && (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Trophy className="size-4" aria-hidden />
                  {platinums} {platinums === 1 ? "platina" : "platinas"}
                </span>
              )}
              {game.steamAppId && (
                <a
                  href={`https://store.steampowered.com/app/${game.steamAppId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                >
                  Ver na Steam <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>
          </header>

          {game.summary && <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-zinc-300">{game.summary}</p>}

          {myLog && (
            <p className="text-sm text-zinc-400">
              No seu perfil como <strong className="text-zinc-200">{STATUS_LABEL[myLog.status]}</strong>.
            </p>
          )}

          <LogForm
            gameId={game.id}
            slug={game.slug}
            loggedIn={Boolean(viewer)}
            initial={
              myLog
                ? { status: myLog.status, rating: myLog.rating, review: myLog.review, containsSpoiler: myLog.containsSpoiler }
                : null
            }
          />
        </div>
      </div>

      {playingNow.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Jogando agora</h2>
          <ul className="flex flex-wrap gap-3">
            {playingNow.map(({ user }) => (
              <li key={user.username}>
                <Link href={`/u/${user.username}`} title={`@${user.username}`}>
                  <Avatar name={user.displayName ?? user.username} src={user.avatarUrl ?? user.steamAvatarUrl} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-zinc-50">Atividade</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-zinc-500">Ninguém compartilhou este jogo ainda. Seja o primeiro!</p>
        ) : (
          <div className="space-y-4">
            {activities.map((a) => (
              <ActivityCard key={a.id} item={a} viewerId={viewer?.id ?? null} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
