import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canSeeProfile } from "@/lib/privacy";
import { ArrowLeft, Bookmark, Target, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getShelf, getShelfCounts, parseTab, PROFILE_TABS } from "@/lib/profile-games";
import { GameCover } from "@/components/game-cover";
import { RatingStars } from "@/components/rating-stars";
import { RARE_PERCENT } from "@/lib/rarity";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ aba?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ username }, { aba }] = await Promise.all([params, searchParams]);
  const tab = PROFILE_TABS.find((t) => t.slug === parseTab(aba))!;
  return { title: `${tab.label} de @${decodeURIComponent(username)} · GameLog` };
}

const EMPTY: Record<string, string> = {
  biblioteca: "Nenhum jogo na biblioteca. A biblioteca vem da Steam vinculada.",
  jogando: "Nada sendo jogado agora.",
  finalizados: "Nenhum jogo finalizado ainda.",
  platinas: "Nenhuma platina ainda.",
  quase: "Nenhum jogo perto da platina (80% ou mais das conquistas). As conquistas são conferidas aos poucos a cada sincronização.",
  dropados: "Nenhum jogo dropado.",
  backlog: "Backlog vazio.",
  wishlist: "Nada na wishlist. Na página de um jogo, clique em “Quero jogar” para ser avisado das promoções.",
};

/** Jogos do perfil por categoria (aberta pelos números do perfil). */
export default async function ProfileGamesPage({ params, searchParams }: Props) {
  const [{ username: raw }, { aba }] = await Promise.all([params, searchParams]);
  const username = decodeURIComponent(raw).toLowerCase();
  const profile = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, isPrivate: true, bannedAt: true },
  });
  if (!profile) notFound();
  if (!(await canSeeProfile((await getCurrentUser())?.id ?? null, profile))) redirect(`/u/${profile.username}`);

  const tab = parseTab(aba);
  const [items, counts] = await Promise.all([getShelf(profile.id, tab), getShelfCounts(profile.id)]);
  const name = profile.displayName ?? profile.username;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href={`/u/${profile.username}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> {name}
      </Link>
      <h1 className="mb-5 text-2xl font-bold text-zinc-50">Jogos de {name}</h1>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-1" aria-label="Categorias">
        {PROFILE_TABS.map((t) => {
          const active = t.slug === tab;
          return (
            <Link
              key={t.slug}
              href={`/u/${profile.username}/jogos?aba=${t.slug}`}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.slug === "platinas" && <Trophy className="size-3.5 text-amber-400" aria-hidden />}
              {t.slug === "quase" && <Target className="size-3.5 text-sky-400" aria-hidden />}
              {t.slug === "wishlist" && <Bookmark className="size-3.5 text-emerald-400" aria-hidden />}
              {t.label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-zinc-700 text-zinc-200" : "bg-zinc-800 text-zinc-500"}`}>
                {counts[t.slug].toLocaleString("pt-BR")}
              </span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">{EMPTY[tab]}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {items.map(({ game, sub, rating, platinum, rarity }) => (
            <li key={game.id}>
              <Link href={`/games/${game.slug}`} className="group block space-y-1.5" title={game.title}>
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
                <p className="line-clamp-2 text-xs font-medium text-zinc-200 group-hover:text-white">{game.title}</p>
                {rarity != null && rarity < RARE_PERCENT && (
                  <span className="inline-block rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">💎 RARA</span>
                )}
                {rating && <RatingStars value={rating} />}
                {sub && <p className="truncate text-[11px] text-zinc-500">{sub}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
