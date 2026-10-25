import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { searchGames } from "@/lib/catalog";
import { GameCover } from "@/components/game-cover";

export const metadata: Metadata = { title: "Jogos · GameLog" };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function GamesPage({ searchParams }: Props) {
  const q = ((await searchParams).q ?? "").trim();
  const results = q ? await searchGames(q) : [];

  // Sem busca: os jogos mais registrados na comunidade
  const popular = q
    ? []
    : await prisma.game.findMany({
        where: { logs: { some: {} } },
        orderBy: { logs: { _count: "desc" } },
        take: 18,
        select: { slug: true, title: true, coverUrl: true, steamAppId: true },
      });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-zinc-50">Jogos</h1>
      <p className="mb-5 text-sm text-zinc-400">Busque um jogo para registrar, avaliar e compartilhar no feed.</p>

      <form action="/games" className="mb-8 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Buscar jogo
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/30">
          <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Elden Ring, Hades, God of War…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500">
          Buscar
        </button>
      </form>

      {q && results.length === 0 && <p className="text-sm text-zinc-500">Nenhum jogo encontrado para “{q}”.</p>}

      {q && results.length > 0 && (
        <Grid>
          {results.map((r) => (
            <GameTile key={r.slug} slug={r.slug} title={r.title} coverUrl={r.coverUrl} steamAppId={r.steamAppId} sub={r.year ?? r.source} />
          ))}
        </Grid>
      )}

      {!q && popular.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Populares no GameLog</h2>
          <Grid>
            {popular.map((g) => (
              <GameTile key={g.slug} {...g} />
            ))}
          </Grid>
        </>
      )}
    </main>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">{children}</ul>;
}

function GameTile(props: { slug: string; title: string; coverUrl: string | null; steamAppId: number | null; sub?: string | number }) {
  return (
    <li>
      <Link href={`/games/${props.slug}`} className="group block space-y-1.5">
        <GameCover title={props.title} coverUrl={props.coverUrl} steamAppId={props.steamAppId} className="transition group-hover:ring-sky-500" />
        <p className="line-clamp-2 text-xs font-medium text-zinc-200 group-hover:text-white">{props.title}</p>
        {props.sub && <p className="text-[11px] text-zinc-500">{props.sub}</p>}
      </Link>
    </li>
  );
}
