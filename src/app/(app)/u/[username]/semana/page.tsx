import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canSeeProfile } from "@/lib/privacy";
import { ArrowLeft, Flag, Heart, PenLine, Trophy, UserPlus, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getWeeklySummary, type WeeklySummary } from "@/lib/weekly";
import { GameCover } from "@/components/game-cover";

type Props = { params: Promise<{ username: string }> };

const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const username = decodeURIComponent((await params).username);
  return { title: `Semana de @${username}`, description: `O que @${username} jogou, finalizou e platinou nos últimos 7 dias.` };
}

/** Resumo dos últimos 7 dias, pronto para compartilhar (tem card de imagem próprio). */
export default async function WeeklyPage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const [profile, viewer] = await Promise.all([
    prisma.user.findUnique({ where: { username }, select: { id: true, username: true, displayName: true, isPrivate: true, bannedAt: true } }),
    getCurrentUser(),
  ]);
  if (!profile) notFound();
  if (!(await canSeeProfile(viewer?.id ?? null, profile))) redirect(`/u/${profile.username}`);

  const w = await getWeeklySummary(profile.id);
  const name = profile.displayName ?? profile.username;
  const isMe = viewer?.id === profile.id;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/u/${profile.username}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> {name}
      </Link>
      <h1 className="text-2xl font-bold text-zinc-50">{isMe ? "Sua semana" : `A semana de ${name}`}</h1>
      <p className="mb-6 text-sm text-zinc-400">
        {dayFmt.format(w.since)} a {dayFmt.format(w.until)}
      </p>

      {!w.hasContent ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Semana tranquila: nada por aqui nos últimos 7 dias.</p>
      ) : (
        <WeeklyBody w={w} />
      )}

      {isMe && w.hasContent && (
        <p className="mt-6 text-center text-sm text-zinc-500">Compartilhe o link desta página: ele vira um card com o seu resumo no WhatsApp, Discord e X.</p>
      )}
    </main>
  );
}

function WeeklyBody({ w }: { w: WeeklySummary }) {
  const stats = [
    { icon: <Trophy className="size-4 text-amber-400" aria-hidden />, label: "Platinas", value: w.platinums.length },
    { icon: <Flag className="size-4 text-emerald-400" aria-hidden />, label: "Finalizados", value: w.completed.length },
    { icon: <Zap className="size-4 text-sky-400" aria-hidden />, label: "Jogos novos", value: w.started.length },
    { icon: <PenLine className="size-4 text-violet-400" aria-hidden />, label: "Reviews", value: w.reviews.length },
    { icon: <Heart className="size-4 text-rose-400" aria-hidden />, label: "Curtidas + GGs", value: w.likes + w.ggs },
    { icon: <UserPlus className="size-4 text-emerald-400" aria-hidden />, label: "Novos seguidores", value: w.followers },
  ];

  return (
    <div className="space-y-8">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <li key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-500">
              {s.icon} {s.label}
            </span>
            <span className="mt-1 block text-2xl font-bold text-zinc-50">{s.value}</span>
          </li>
        ))}
      </ul>

      {w.topGames.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">
            Mais jogados <span className="text-sm font-normal text-zinc-500">· {w.hours2Weeks} h nas últimas 2 semanas (Steam)</span>
          </h2>
          <ul className="grid grid-cols-3 gap-4">
            {w.topGames.map(({ game, hours }) => (
              <li key={game.id}>
                <Link href={`/games/${game.slug}`} className="group block space-y-1.5">
                  <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} className="transition group-hover:ring-sky-500" />
                  <p className="truncate text-xs font-medium text-zinc-200">{game.title}</p>
                  <p className="text-[11px] text-zinc-500">{hours.toLocaleString("pt-BR")} h</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GameList title="Platinas da semana" games={w.platinums} />
      <GameList title="Finalizados" games={w.completed} />
      <GameList title="Começou a jogar" games={w.started} />
    </div>
  );
}

function GameList({ title, games }: { title: ReactNode; games: WeeklySummary["started"] }) {
  if (games.length === 0) return null;
  const unique = games.filter((g, i) => games.findIndex((x) => x.id === g.id) === i);
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-zinc-50">{title}</h2>
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {unique.map((g) => (
          <li key={g.id}>
            <Link href={`/games/${g.slug}`} title={g.title} className="group block">
              <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} className="transition group-hover:ring-sky-500" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
