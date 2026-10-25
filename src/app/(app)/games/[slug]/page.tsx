import type { Metadata } from "next";
import { Suspense } from "react";
import { after } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateGame } from "@/lib/catalog";
import { getActivities } from "@/lib/activity";
import { visibleUsersWhere } from "@/lib/privacy";
import { STATUS_LABEL } from "@/lib/format";
import { communityScore, MIN_RATINGS_FOR_SCORE } from "@/lib/score";
import { ActivityCard } from "@/components/activity-card";
import { Avatar } from "@/components/avatar";
import { GameCover } from "@/components/game-cover";
import { ScoreBadge } from "@/components/score-badge";
import { LogForm } from "./_components/log-form";
import { WishlistButton } from "./_components/wishlist-button";
import { AddToList } from "./_components/add-to-list";
import { getListCards } from "@/lib/lists";
import { ListGrid } from "@/components/list-card";
import { Achievements } from "./_components/achievements";
import { GameMedia, type Screenshot, type Trailer } from "./_components/media";
import { GameNews } from "./_components/news";
import { GameReviews, parseReviewFilter } from "./_components/reviews";
import { TimeToBeat } from "./_components/time-to-beat";
import { ensureRawgPlaytime, getGameTimes } from "@/lib/time-to-beat";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ reviews?: string }> };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = await prisma.game.findUnique({ where: { slug }, select: { title: true, summary: true } });
  return { title: game?.title ?? "Jogo", description: game?.summary?.slice(0, 160), openGraph: { title: game?.title ?? "Jogo" } };
}

export default async function GamePage({ params, searchParams }: Props) {
  const [{ slug }, { reviews: reviewsParam }] = await Promise.all([params, searchParams]);
  const [game, viewer] = await Promise.all([getOrCreateGame(slug), getCurrentUser()]);
  if (!game) notFound();

  // Média da RAWG preenchida depois da resposta (aparece na próxima visita)
  if (!game.rawgPlaytimeCheckedAt) after(() => ensureRawgPlaytime(game));

  const [myLog, wishlisted, ratingGroups, platinums, playingNow, activities, times, myLibrary, myLists, inLists] = await Promise.all([
    viewer ? prisma.gameLog.findUnique({ where: { userId_gameId: { userId: viewer.id, gameId: game.id } } }) : null,
    viewer ? prisma.wishlistItem.findUnique({ where: { userId_gameId: { userId: viewer.id, gameId: game.id } } }).then(Boolean) : false,
    prisma.gameLog.groupBy({ by: ["rating"], where: { gameId: game.id, rating: { not: null } }, _count: { _all: true } }),
    prisma.gameLog.count({ where: { gameId: game.id, status: "PLATINUM" } }),
    prisma.gameLog.findMany({
      where: { gameId: game.id, status: "PLAYING", user: await visibleUsersWhere(viewer?.id ?? null) },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { user: { select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } } },
    }),
    getActivities({ where: { gameId: game.id }, viewerId: viewer?.id ?? null, take: 20 }),
    getGameTimes(game),
    viewer
      ? prisma.libraryEntry.findUnique({
          where: { userId_gameId: { userId: viewer.id, gameId: game.id } },
          select: { playtimeMinutes: true, platinumAt: true },
        })
      : null,
    viewer
      ? prisma.gameList.findMany({
          where: { userId: viewer.id },
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: { id: true, title: true, items: { where: { gameId: game.id }, select: { gameId: true } } },
        })
      : [],
    getListCards({ viewerId: viewer?.id ?? null, where: { items: { some: { gameId: game.id } } }, orderBy: [{ likes: { _count: "desc" } }, { updatedAt: "desc" }], take: 3 }),
  ]);

  // Distribuição das estrelas e Nota Poneglyph.gg (0–100)
  const dist = [5, 4, 3, 2, 1].map((stars) => ({ stars, n: ratingGroups.find((g) => g.rating === stars)?._count._all ?? 0 }));
  const ratingCount = dist.reduce((acc, d) => acc + d.n, 0);
  const avg = ratingCount ? dist.reduce((acc, d) => acc + d.stars * d.n, 0) / ratingCount : 0;
  const score = ratingCount >= MIN_RATINGS_FOR_SCORE ? communityScore(avg) : null;

  const trailers = (game.trailers as Trailer[] | null) ?? [];
  const screenshots = (game.screenshots as Screenshot[] | null) ?? [];
  const credits = [
    game.developers.length ? { label: "Desenvolvedora", value: game.developers.join(", ") } : null,
    game.publishers.length ? { label: "Publicadora", value: game.publishers.join(", ") } : null,
    game.releaseDate ? { label: "Lançamento", value: dateFmt.format(game.releaseDate) } : null,
    game.genres.length ? { label: "Gêneros", value: game.genres.join(", ") } : null,
    game.platforms.length ? { label: "Plataformas", value: game.platforms.join(", ") } : null,
  ].filter((c): c is { label: string; value: string } => c !== null);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12">
      {/* ---- Fundo com a arte do jogo --------------------------------------- */}
      <div className="relative -mx-4 mb-[-7rem] h-56 overflow-hidden sm:mx-0 sm:mt-6 sm:rounded-2xl md:h-72">
        {game.heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.heroUrl} alt="" className="size-full object-cover opacity-60" />
        ) : (
          <div className="size-full bg-gradient-to-br from-brand-900/50 via-zinc-900 to-ember-900/50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
      </div>

      <div className="relative grid gap-5 px-0 sm:gap-8 sm:px-6 md:grid-cols-[220px_1fr]">
        <div className="mx-auto w-36 sm:w-44 md:w-full">
          <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} className="shadow-2xl shadow-black/60" />
        </div>

        <div className="min-w-0 space-y-5 md:pt-24">
          <header className="space-y-1 text-center md:text-left">
            <h1 className="text-2xl font-extrabold text-zinc-50 sm:text-4xl">{game.title}</h1>
            <p className="text-sm text-zinc-400">
              {[game.releaseDate?.getUTCFullYear(), game.developers[0], game.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}
            </p>
          </header>

          {/* ---- Notas ----------------------------------------------------- */}
          <section className="grid gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:grid-cols-[auto_auto_1fr] sm:items-center sm:p-5">
            <ScoreBadge
              score={score}
              title="Nota Poneglyph.gg"
              caption={ratingCount ? `${ratingCount} ${ratingCount === 1 ? "nota" : "notas"}` : "Sem notas ainda"}
            />
            {game.metacriticScore !== null && (
              <ScoreBadge score={game.metacriticScore} title="Metascore" caption="Críticos · Metacritic" href={game.metacriticUrl} />
            )}
            {ratingCount > 0 && (
              <ul className="space-y-1 sm:col-start-3" aria-label="Distribuição das notas">
                {dist.map((d) => (
                  <li key={d.stars} className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="w-6 tabular-nums">{d.stars}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(d.n / ratingCount) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{d.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <WishlistButton gameId={game.id} slug={game.slug} initial={wishlisted} loggedIn={Boolean(viewer)} />
            {!viewer?.bannedAt && (
              <AddToList slug={game.slug} loggedIn={Boolean(viewer)} lists={myLists.map((l) => ({ id: l.id, title: l.title, hasGame: l.items.length > 0 }))} />
            )}
            {game.priceFinal !== null && (
              <span className="flex items-baseline gap-2">
                {game.discountPercent ? (
                  <>
                    <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">-{game.discountPercent}%</span>
                    {game.priceOriginal && <span className="text-zinc-500 line-through">{brl.format(game.priceOriginal / 100)}</span>}
                    <span className="font-semibold text-emerald-400">{brl.format(game.priceFinal / 100)}</span>
                  </>
                ) : (
                  <span className="text-zinc-300">{brl.format(game.priceFinal / 100)}</span>
                )}
              </span>
            )}
            {platinums > 0 && (
              <span className="flex items-center gap-1.5 text-amber-300">
                <Trophy className="size-4" aria-hidden />
                {platinums} {platinums === 1 ? "platina" : "platinas"} no Poneglyph.gg
              </span>
            )}
            {game.steamAppId && (
              <a
                href={`https://store.steampowered.com/app/${game.steamAppId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-400 hover:underline"
              >
                Ver na Steam <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </div>

          {game.summary && <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-zinc-300">{game.summary}</p>}

          {credits.length > 0 && (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {credits.map((c) => (
                <div key={c.label}>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">{c.label}</dt>
                  <dd className="text-zinc-200">{c.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <TimeToBeat
            times={times}
            myMinutes={myLibrary?.playtimeMinutes ?? null}
            finished={Boolean(myLibrary?.platinumAt) || myLog?.status === "COMPLETED" || myLog?.status === "PLATINUM"}
          />

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

      {game.steamAppId && (
        <Suspense fallback={<div className="mt-10 h-40 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
          <Achievements
            appId={game.steamAppId}
            steamId={viewer?.steamId ?? null}
            owner={viewer?.steamId ? { userId: viewer.id, gameId: game.id } : null}
          />
        </Suspense>
      )}

      {(trailers.length > 0 || screenshots.length > 0) && <GameMedia title={game.title} trailers={trailers} screenshots={screenshots} />}

      <GameReviews gameId={game.id} slug={game.slug} filter={parseReviewFilter(reviewsParam)} viewerId={viewer?.id ?? null} />

      {game.steamAppId && (
        <Suspense fallback={null}>
          <GameNews appId={game.steamAppId} />
        </Suspense>
      )}

      {inLists.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Em listas da comunidade</h2>
          <ListGrid lists={inLists} />
        </section>
      )}

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
