import type { ReactNode } from "react";
import Link from "next/link";
import { Bookmark, CalendarClock, Gamepad2, ListOrdered, Percent, Radio, Rocket, UserRound, Users } from "lucide-react";
import { getMyClubs, getNowPlaying, getUpcomingWishlist, getWishlistDeals } from "@/lib/feed-sidebar";
import { getPopularLists } from "@/lib/lists";
import { Avatar } from "@/components/avatar";
import { GameCover } from "@/components/game-cover";
import { UserTitle } from "@/components/user-title";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });

/** Moldura comum dos cards da lateral. */
export function SideCard({ icon, title, more, children }: { icon: ReactNode; title: string; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        {icon}
        {title}
        {more && (
          <Link href={more.href} className="ml-auto text-xs font-normal text-brand-400 hover:underline">
            {more.label}
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}

// =============================================================================
//  1. Jogando agora (Steam, em tempo real)
// =============================================================================

export async function NowPlayingCard({ viewerId }: { viewerId: string }) {
  const items = await getNowPlaying(viewerId);
  if (items.length === 0) return null;
  return (
    <SideCard icon={<Radio className="size-4 text-emerald-400" aria-hidden />} title="Jogando agora">
      <ul className="space-y-2.5">
        {items.map(({ user, game }) => (
          <li key={user.username} className="flex items-center gap-3">
            <Link href={`/u/${user.username}`} className="relative shrink-0" title={`@${user.username}`}>
              <Avatar name={user.name} src={user.avatar} size="sm" />
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-zinc-900" aria-hidden />
            </Link>
            <span className="min-w-0 flex-1 text-sm leading-tight">
              <Link href={`/u/${user.username}`} className="block truncate font-medium text-zinc-100 hover:underline">
                {user.name}
              </Link>
              <Link href={`/games/${game.slug}`} className="block truncate text-xs text-emerald-300/90 hover:underline">
                {game.name}
              </Link>
            </span>
            <Link href={`/games/${game.slug}`} className="w-8 shrink-0" aria-hidden tabIndex={-1}>
              <GameCover title={game.name} coverUrl={game.coverUrl} steamAppId={game.appId} />
            </Link>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

// =============================================================================
//  2. Lançamentos da wishlist
// =============================================================================

export async function ReleasesCard({ userId }: { userId: string }) {
  const items = await getUpcomingWishlist(userId);
  if (items.length === 0) return null;
  return (
    <SideCard icon={<CalendarClock className="size-4 text-brand-400" aria-hidden />} title="Lançamentos da wishlist" more={{ href: "/lancamentos", label: "Calendário" }}>
      <ul className="space-y-2.5">
        {items.map(({ game, day, isToday }) => (
          <li key={game.slug}>
            <Link href={`/games/${game.slug}`} className="flex items-center gap-3 rounded-lg hover:bg-zinc-800/60">
              <span className="w-9 shrink-0">
                <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">{game.title}</span>
                {isToday ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300">
                    <Rocket className="size-3" aria-hidden /> Lança hoje!
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">{dayFmt.format(new Date(`${day}T00:00:00Z`))}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

// =============================================================================
//  3. Promoções da wishlist
// =============================================================================

export async function DealsCard({ userId }: { userId: string }) {
  const deals = await getWishlistDeals(userId);
  if (deals.length === 0) return null;
  return (
    <SideCard icon={<Percent className="size-4 text-emerald-400" aria-hidden />} title="Em promoção na sua wishlist">
      <ul className="space-y-2.5">
        {deals.map((g) => (
          <li key={g.slug}>
            <Link href={`/games/${g.slug}`} className="flex items-center gap-3 rounded-lg hover:bg-zinc-800/60">
              <span className="w-9 shrink-0">
                <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">{g.title}</span>
                <span className="text-xs">
                  {g.priceOriginal ? <span className="mr-1.5 text-zinc-500 line-through">{brl.format(g.priceOriginal / 100)}</span> : null}
                  {g.priceFinal !== null && <span className="font-medium text-emerald-400">{brl.format(g.priceFinal / 100)}</span>}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-emerald-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">-{g.discountPercent}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

// =============================================================================
//  5. Listas em alta
// =============================================================================

export async function PopularListsCard({ viewerId }: { viewerId: string }) {
  const lists = await getPopularLists(viewerId, 3).catch(() => []);
  if (lists.length === 0) return null;
  return (
    <SideCard icon={<ListOrdered className="size-4 text-brand-400" aria-hidden />} title="Listas em alta" more={{ href: "/listas", label: "Ver todas" }}>
      <ul className="space-y-3">
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={`/listas/${l.id}`} className="group block">
              <span className="flex">
                {l.covers.slice(0, 4).map((g, i) => (
                  <span key={g.slug} className="w-10 shrink-0" style={{ marginLeft: i ? -10 : 0, zIndex: 4 - i }}>
                    <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} className="shadow-md shadow-black/60" />
                  </span>
                ))}
              </span>
              <span className="mt-1.5 block truncate text-sm font-medium text-zinc-100 group-hover:text-white">{l.title}</span>
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                {l.author.name}
                <UserTitle title={l.author.title} compact /> · {l.itemCount} {l.itemCount === 1 ? "jogo" : "jogos"} · ♥ {l.likeCount}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

// =============================================================================
//  6. Coluna da esquerda (telas largas): atalhos e meus clubes
// =============================================================================

export async function ShortcutsAndClubs({ userId, username }: { userId: string; username: string }) {
  const clubs = await getMyClubs(userId);
  const links = [
    { href: `/u/${username}`, label: "Meu perfil", icon: UserRound },
    { href: `/u/${username}/jogos?aba=wishlist`, label: "Quero jogar", icon: Bookmark },
    { href: `/u/${username}/jogos?aba=jogando`, label: "Jogando", icon: Gamepad2 },
    { href: "/listas", label: "Listas", icon: ListOrdered },
    { href: "/lancamentos", label: "Lançamentos", icon: CalendarClock },
    { href: "/clubes", label: "Clubes", icon: Users },
  ];
  return (
    <div className="space-y-6">
      <nav aria-label="Atalhos" className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-2 backdrop-blur-sm">
        <ul>
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-50">
                <Icon className="size-4 text-zinc-500" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <SideCard icon={<Users className="size-4 text-brand-400" aria-hidden />} title="Seus clubes" more={clubs.length ? { href: "/clubes", label: "Todos" } : undefined}>
        {clubs.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Você ainda não está em nenhum clube.{" "}
            <Link href="/clubes" className="text-brand-400 hover:underline">
              Encontre um
            </Link>
            .
          </p>
        ) : (
          <ul className="-mx-1 space-y-0.5">
            {clubs.map((c) => (
              <li key={c.slug}>
                <Link href={`/clubes/${c.slug}`} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition hover:bg-zinc-800/70">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-700 to-ember-900 text-xs font-bold text-white">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{c.name}</span>
                  {c.today > 0 && (
                    <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white" title={`${c.today} posts nas últimas 24h`}>
                      {c.today}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SideCard>
    </div>
  );
}
