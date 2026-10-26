import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Heart, MessageCircle, Sparkles, Star, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canSeeProfile } from "@/lib/privacy";
import { getWrapped, wrappedYears } from "@/lib/wrapped";
import { GameCover } from "@/components/game-cover";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ ano?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const ano = (await searchParams).ano ?? "";
  return { title: `Retrospectiva ${ano} de @${username}`, openGraph: { title: `Retrospectiva ${ano} de @${username}` } };
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Retrospectiva do ano (o "Wrapped"): números, gêneros, mês mais movimentado, melhores notas e platinas. */
export default async function WrappedPage({ params, searchParams }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const profile = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true, displayName: true, isPrivate: true, bannedAt: true } });
  if (!profile) notFound();
  if (!(await canSeeProfile((await getCurrentUser())?.id ?? null, profile))) redirect(`/u/${profile.username}`);

  const years = await wrappedYears(profile.id);
  if (years.length === 0) redirect(`/u/${profile.username}`);
  const asked = Number((await searchParams).ano);
  const year = years.includes(asked) ? asked : years[0];
  const w = await getWrapped(profile.id, year);
  const name = profile.displayName ?? profile.username;
  const maxMonth = Math.max(1, ...w.byMonth);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
      <Link href={`/u/${profile.username}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> {name}
      </Link>

      <header className="overflow-hidden rounded-3xl border border-brand-900/60 bg-gradient-to-br from-brand-950 via-zinc-950 to-black p-6 sm:p-8">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-brand-400">
          <Sparkles className="size-4" aria-hidden /> Retrospectiva
        </p>
        <h1 className="mt-2 text-4xl font-extrabold text-zinc-50 sm:text-5xl">
          {name} em {year}
        </h1>
        {years.length > 1 && (
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Ano">
            {years.map((y) => (
              <Link
                key={y}
                href={`/u/${profile.username}/retrospectiva?ano=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-sm ${y === year ? "bg-brand-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
              >
                {y}
              </Link>
            ))}
          </nav>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Big label="jogos com atividade" value={w.played} />
          <Big label="finalizados" value={w.completed} />
          <Big label="platinas" value={w.platinums.length} gold />
          <Big label="reviews" value={w.reviews} />
        </dl>
        <a
          href={`/u/${profile.username}/retrospectiva.png?ano=${year}`}
          download={`retrospectiva-${year}-${profile.username}.png`}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          <Download className="size-4" aria-hidden /> Baixar imagem para compartilhar
        </a>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card title="Mês mais movimentado">
          {w.bestMonth ? (
            <>
              <p className="mb-3 text-2xl font-bold capitalize text-zinc-50">{w.bestMonth.name}</p>
              <div className="flex h-24 items-end gap-1" aria-hidden>
                {w.byMonth.map((n, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className={`w-full rounded-t ${n === maxMonth ? "bg-brand-500" : "bg-zinc-700"}`} style={{ height: `${Math.max(4, (n / maxMonth) * 80)}px` }} />
                    <span className="text-[10px] text-zinc-500">{MONTH_SHORT[i]}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">{w.bestMonth.posts} publicações nesse mês</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Sem publicações neste ano.</p>
          )}
        </Card>

        <Card title="Gêneros do ano">
          {w.genres.length ? (
            <ol className="space-y-2">
              {w.genres.map((g, i) => (
                <li key={g.genre} className="flex items-center gap-3">
                  <span className="text-lg font-extrabold text-brand-400">{i + 1}</span>
                  <span className="flex-1 text-zinc-100">{g.genre}</span>
                  <span className="text-sm tabular-nums text-zinc-500">{Math.round(g.share * 100)}%</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-zinc-500">Sem gêneros registrados.</p>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            {w.started} {w.started === 1 ? "jogo começado" : "jogos começados"} · {w.newFollowers} {w.newFollowers === 1 ? "seguidor novo" : "seguidores novos"}
          </p>
        </Card>
      </div>

      {w.topRated.length > 0 && (
        <Shelf title="Melhores notas do ano" icon={<Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />}>
          {w.topRated.map(({ game, rating }) => (
            <li key={game.id}>
              <Link href={`/games/${game.slug}`} className="group block space-y-1">
                <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} className="transition group-hover:ring-brand-500" />
                <p className="text-center text-xs text-amber-300">{"★".repeat(rating)}</p>
              </Link>
            </li>
          ))}
        </Shelf>
      )}

      {w.platinums.length > 0 && (
        <Shelf title="Platinas do ano" icon={<Trophy className="size-4 text-amber-400" aria-hidden />}>
          {w.platinums.slice(0, 10).map((game) => (
            <li key={game.id}>
              <Link href={`/games/${game.slug}`} title={game.title}>
                <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} className="ring-amber-400/60" />
              </Link>
            </li>
          ))}
        </Shelf>
      )}

      {w.mostLiked && (
        <Card title="Publicação que mais bombou" className="mt-6">
          <Link href={`/p/${w.mostLiked.id}`} className="flex items-center gap-4 rounded-xl hover:bg-zinc-800/50">
            <span className="w-14 shrink-0">
              <GameCover title={w.mostLiked.game.title} coverUrl={w.mostLiked.game.coverUrl} steamAppId={w.mostLiked.game.steamAppId} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-zinc-100">{w.mostLiked.game.title}</span>
              <span className="flex gap-3 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Heart className="size-3.5" aria-hidden /> {w.mostLiked.likes}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="size-3.5" aria-hidden /> {w.mostLiked.comments}
                </span>
              </span>
            </span>
          </Link>
        </Card>
      )}
    </main>
  );
}

function Big({ label, value, gold }: { label: string; value: number; gold?: boolean }) {
  // Rótulo vem antes no HTML (dt → dd), mas aparece embaixo do número
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className={`text-4xl font-extrabold tabular-nums ${gold ? "text-amber-300" : "text-zinc-50"}`}>{value.toLocaleString("pt-BR")}</dd>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

function Shelf({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-50">
        {icon}
        {title}
      </h2>
      <ul className="grid grid-cols-5 gap-3">{children}</ul>
    </section>
  );
}
