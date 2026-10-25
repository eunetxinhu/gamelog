import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, Flame, Percent, Search, Sparkles, Star, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { searchGames } from "@/lib/catalog";
import { getStoreHighlights, type StoreListItem } from "@/lib/steam/api";
import { communityScore, MIN_RATINGS_FOR_SCORE } from "@/lib/score";
import { GameCover } from "@/components/game-cover";
import { ScoreBadge } from "@/components/score-badge";
import { ScrollRow } from "@/components/scroll-row";
import { WishlistQuickButton } from "@/components/wishlist-quick-button";
import { getCurrentUser } from "@/lib/auth";
import { wishlistSetFor } from "@/lib/wishlist";
import { inWishlist } from "@/lib/wishlist-keys";

export const metadata: Metadata = { title: "Jogos · GameLog" };

/** Quem está vendo e o que já está na wishlist dele (para o botão sobre as capas). */
type Wish = { loggedIn: boolean; set: Set<string> };

type Props = { searchParams: Promise<{ q?: string }> };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function GamesPage({ searchParams }: Props) {
  const q = ((await searchParams).q ?? "").trim();
  const viewerId = (await getCurrentUser())?.id ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <h1 className="mb-1 text-2xl font-bold text-zinc-50">Jogos</h1>
      <p className="mb-4 text-sm text-zinc-400 sm:mb-5">Busque um jogo para registrar, avaliar e compartilhar no feed.</p>

      <form action="/games" className="mb-6 flex gap-2 sm:mb-8">
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
            type="search"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm sm:py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500">
          Buscar
        </button>
      </form>

      {q ? <SearchResults q={q} viewerId={viewerId} /> : <Hub viewerId={viewerId} />}
    </main>
  );
}

// =============================================================================
//  Busca
// =============================================================================

async function SearchResults({ q, viewerId }: { q: string; viewerId: string | null }) {
  const { results, didYouMean } = await searchGames(q);
  if (results.length === 0) return <p className="text-sm text-zinc-500">Nenhum jogo encontrado para “{q}”.</p>;
  const wish: Wish = { loggedIn: !!viewerId, set: await wishlistSetFor(viewerId, results) };
  return (
    <>
      {didYouMean && (
        <p className="mb-4 text-sm text-zinc-400">
          Você quis dizer{" "}
          <Link href={`/games?q=${encodeURIComponent(didYouMean)}`} className="font-medium text-sky-400 hover:underline">
            {didYouMean}
          </Link>
          ?
        </p>
      )}
      <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {results.map((r) => (
          <CoverTile
            key={r.slug}
            slug={r.slug}
            title={r.title}
            coverUrl={r.coverUrl}
            steamAppId={r.steamAppId}
            sub={r.source === "GameLog" ? (r.year ?? "No GameLog") : (r.year ?? r.source)}
            wish={wish}
          />
        ))}
      </ul>
    </>
  );
}

// =============================================================================
//  Hub (sem busca)
// =============================================================================

async function Hub({ viewerId }: { viewerId: string | null }) {
  const [store, bestRaw, popular] = await Promise.all([
    getStoreHighlights(),
    // Melhores no GameLog: maior média, com um mínimo de notas
    prisma.gameLog.groupBy({
      by: ["gameId"],
      where: { rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
      having: { rating: { _count: { gte: MIN_RATINGS_FOR_SCORE } } },
      orderBy: [{ _avg: { rating: "desc" } }, { _count: { rating: "desc" } }],
      take: 10,
    }),
    prisma.game.findMany({
      where: { logs: { some: {} } },
      orderBy: { logs: { _count: "desc" } },
      take: 12,
      select: { slug: true, title: true, coverUrl: true, steamAppId: true, _count: { select: { logs: true } } },
    }),
  ]);

  const storeItems = store ? [...store.topSellers, ...store.newReleases, ...store.comingSoon, ...store.specials] : [];
  const wish: Wish = {
    loggedIn: !!viewerId,
    set: await wishlistSetFor(viewerId, [
      ...storeItems.map((i) => ({ slug: `steam-${i.appId}`, steamAppId: i.appId })),
      ...popular.map((g) => ({ slug: g.slug, steamAppId: g.steamAppId })),
    ]),
  };

  const bestGames = new Map(
    (
      await prisma.game.findMany({
        where: { id: { in: bestRaw.map((b) => b.gameId) } },
        select: { id: true, slug: true, title: true, coverUrl: true, steamAppId: true, metacriticScore: true },
      })
    ).map((g) => [g.id, g]),
  );
  const best = bestRaw.flatMap((b) => {
    const game = bestGames.get(b.gameId);
    return game ? [{ game, score: communityScore(b._avg.rating ?? 0), count: b._count.rating }] : [];
  });

  return (
    <div className="space-y-12">
      {store && store.topSellers.length > 0 && (
        <StoreRow title="Mais vendidos na Steam" icon={<Flame className="size-4 text-orange-400" aria-hidden />} items={store.topSellers} wish={wish} />
      )}

      {best.length > 0 && (
        <section>
          <SectionTitle icon={<Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />}>Melhores no GameLog</SectionTitle>
          <ol className="divide-y divide-zinc-800/80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
            {best.map(({ game, score, count }, i) => (
              <li key={game.id}>
                <Link href={`/games/${game.slug}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-zinc-800/60">
                  <span className="w-6 text-right text-sm font-bold tabular-nums text-zinc-500">{i + 1}</span>
                  <span className="w-10 shrink-0">
                    <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-100">{game.title}</span>
                    <span className="text-xs text-zinc-500">
                      {count} notas{game.metacriticScore !== null && ` · Metascore ${game.metacriticScore}`}
                    </span>
                  </span>
                  <ScoreBadge score={score} title="Nota GameLog" size="sm" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {store && store.newReleases.length > 0 && (
        <StoreRow title="Novos lançamentos" icon={<Sparkles className="size-4 text-sky-400" aria-hidden />} items={store.newReleases} wish={wish} />
      )}
      {store && store.comingSoon.length > 0 && (
        <StoreRow title="Em breve" icon={<CalendarClock className="size-4 text-violet-400" aria-hidden />} items={store.comingSoon} wish={wish} upcoming />
      )}
      {store && store.specials.length > 0 && (
        <StoreRow title="Promoções na Steam" icon={<Percent className="size-4 text-emerald-400" aria-hidden />} items={store.specials} wish={wish} />
      )}

      {popular.length > 0 && (
        <section>
          <SectionTitle icon={<Users className="size-4 text-sky-400" aria-hidden />}>Mais registrados no GameLog</SectionTitle>
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {popular.map((g) => (
              <CoverTile key={g.slug} {...g} wish={wish} sub={`${g._count.logs} ${g._count.logs === 1 ? "registro" : "registros"}`} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-zinc-600">Vitrines, preços e Metascore vêm da loja da Steam.</p>
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

/** Fileira horizontal com as imagens largas da loja e preço/desconto. */
function StoreRow({
  title,
  icon,
  items,
  upcoming,
  wish,
}: {
  title: string;
  icon: ReactNode;
  items: StoreListItem[];
  upcoming?: boolean;
  wish: Wish;
}) {
  return (
    <section>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <ScrollRow label={title} className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4">
        {items.map((item) => (
          <li key={item.appId} className="relative w-[68vw] max-w-56 shrink-0 snap-start sm:w-56">
            <Link href={`/games/steam-${item.appId}`} className="group block">
              <div className="relative overflow-hidden rounded-lg ring-1 ring-white/10 transition group-hover:ring-sky-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt="" loading="lazy" className="aspect-[460/215] w-full object-cover" />
                {item.discountPercent > 0 && (
                  <span className="absolute left-2 top-2 rounded-md bg-emerald-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">
                    -{item.discountPercent}%
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-sm font-medium text-zinc-200 group-hover:text-white">{item.name}</p>
              <p className="text-xs text-zinc-500">
                {upcoming ? (
                  "Em breve"
                ) : item.finalPrice === null ? (
                  "Gratuito"
                ) : (
                  <>
                    {item.discountPercent > 0 && item.originalPrice && (
                      <span className="mr-1.5 line-through">{brl.format(item.originalPrice / 100)}</span>
                    )}
                    <span className={item.discountPercent > 0 ? "font-medium text-emerald-400" : ""}>{brl.format(item.finalPrice / 100)}</span>
                  </>
                )}
              </p>
            </Link>
            <WishlistQuickButton
              slug={`steam-${item.appId}`}
              title={item.name}
              initial={inWishlist(wish.set, { slug: `steam-${item.appId}`, steamAppId: item.appId })}
              loggedIn={wish.loggedIn}
              className="right-1.5 top-1.5"
            />
          </li>
        ))}
      </ScrollRow>
    </section>
  );
}

function CoverTile(props: {
  slug: string;
  title: string;
  coverUrl: string | null;
  steamAppId: number | null;
  sub?: string | number;
  wish: Wish;
}) {
  return (
    <li className="relative">
      <Link href={`/games/${props.slug}`} className="group block space-y-1.5">
        <GameCover title={props.title} coverUrl={props.coverUrl} steamAppId={props.steamAppId} className="transition group-hover:ring-sky-500" />
        <p className="line-clamp-2 text-xs font-medium text-zinc-200 group-hover:text-white">{props.title}</p>
        {props.sub && <p className="text-[11px] text-zinc-500">{props.sub}</p>}
      </Link>
      <WishlistQuickButton
        slug={props.slug}
        title={props.title}
        initial={inWishlist(props.wish.set, props)}
        loggedIn={props.wish.loggedIn}
        className="right-1 top-1"
      />
    </li>
  );
}
