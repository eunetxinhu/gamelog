import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, Mail, PenSquare, Search, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActivities, PAGE_SIZE, type FeedItem } from "@/lib/activity";
import { getForYou } from "@/lib/for-you";
import { blockedIds } from "@/lib/privacy";
import { recentConversations } from "@/lib/dm";
import { relativeTime } from "@/lib/format";
import { ActivityCard } from "@/components/activity-card";
import { Avatar } from "@/components/avatar";
import { PhotoComposer } from "./_components/photo-composer";
import { DealsCard, NowPlayingCard, PopularListsCard, ReleasesCard, ShortcutsAndClubs } from "./_components/sidebar";
import { DismissOnboarding } from "../bem-vindo/_components/finish-button";
import { onboardingSteps } from "@/lib/onboarding";
import type { GameOption } from "./_actions/photo-post";

export const metadata: Metadata = { title: "Feed" };

type Props = {
  searchParams: Promise<{ tab?: string; before?: string; pagina?: string; senha?: string; postar?: string; compartilhado?: string; texto?: string }>;
};

type FeedTab = "following" | "foryou" | "global";

const quickGameSelect = { slug: true, title: true, coverUrl: true, steamAppId: true, releaseDate: true } as const;

/** Atalhos do seletor de jogo do post: jogando na Steam + registrados por último. */
async function quickGamesFor(userId: string): Promise<GameOption[]> {
  const [recent, logs] = await Promise.all([
    prisma.libraryEntry.findMany({
      where: { userId, playtime2WeeksMinutes: { gt: 0 } },
      orderBy: { playtime2WeeksMinutes: "desc" },
      take: 6,
      select: { game: { select: quickGameSelect } },
    }),
    prisma.gameLog.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 8, select: { game: { select: quickGameSelect } } }),
  ]);
  const seen = new Set<string>();
  return [...recent, ...logs]
    .map(({ game }) => game)
    .filter((g) => !seen.has(g.slug) && seen.add(g.slug))
    .slice(0, 8)
    .map(({ releaseDate, ...g }) => ({ ...g, year: releaseDate?.getUTCFullYear() ?? null }));
}

export default async function FeedPage({ searchParams }: Props) {
  const query = await searchParams;
  const viewer = await getCurrentUser();
  // Sem login, volta para cá depois (com o ?postar / ?compartilhado de quem veio do "Compartilhar")
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/feed?${new URLSearchParams(query as Record<string, string>)}`)}`);

  // Em paralelo: cada ida ao banco custa uma viagem de rede
  const [hidden, followingIds, favoritesCount] = await Promise.all([
    blockedIds(viewer.id),
    prisma.follow
      .findMany({ where: { followerId: viewer.id, status: "ACCEPTED" }, select: { followingId: true } })
      .then((rows) => rows.map((f) => f.followingId)),
    viewer.onboardedAt ? 0 : prisma.favoriteGame.count({ where: { userId: viewer.id } }),
  ]);

  // Quem ainda não segue ninguém cai no "Para você" por padrão
  const tab: FeedTab =
    query.tab === "global" || query.tab === "foryou" || query.tab === "following" ? query.tab : followingIds.length === 0 ? "foryou" : "following";
  const before = query.before && !Number.isNaN(Date.parse(query.before)) ? new Date(query.before) : undefined;
  const page = Math.max(0, Math.min(50, Number.parseInt(query.pagina ?? "0", 10) || 0));

  const onboarding = viewer.onboardedAt
    ? null
    : onboardingSteps({
        hasSteam: Boolean(viewer.steamId),
        favorites: favoritesCount,
        following: followingIds.length,
      });

  const [feed, suggestions, quickGames, conversations] = await Promise.all([
    tab === "foryou"
      ? getForYou(viewer.id, followingIds, page)
      : getActivities({
          where: tab === "following" ? { userId: { in: [...followingIds, viewer.id] } } : undefined,
          viewerId: viewer.id,
          before,
        }).then((items): { items: FeedItem[]; hasMore: boolean } => ({ items, hasMore: items.length === PAGE_SIZE })),
    // Quem seguir: usuários com publicações recentes que você ainda não segue
    prisma.user.findMany({
      where: { id: { notIn: [...followingIds, viewer.id, ...hidden] }, bannedAt: null, activities: { some: {} } },
      orderBy: { activities: { _count: "desc" } },
      take: 5,
      select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true },
    }),
    viewer.bannedAt ? [] : quickGamesFor(viewer.id),
    recentConversations(viewer.id, hidden, 5),
  ]);

  const items = feed.items;
  const olderHref = !feed.hasMore
    ? null
    : tab === "foryou"
      ? `/feed?tab=foryou&pagina=${page + 1}`
      : `/feed?tab=${tab}&before=${encodeURIComponent(items[items.length - 1].createdAt.toISOString())}`;

  return (
    // Telas largas (xl): três colunas, com atalhos e clubes à esquerda
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-4 sm:py-8 lg:grid-cols-[minmax(0,1fr)_280px] xl:max-w-7xl xl:grid-cols-[220px_minmax(0,1fr)_300px]">
      <aside className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
        <Suspense fallback={null}>
          <ShortcutsAndClubs userId={viewer.id} username={viewer.username} />
        </Suspense>
      </aside>
      {/* Celular: botão flutuante abre o post de fotos, acima da barra inferior */}
      {!viewer.bannedAt && (
        <Link
          href={`/feed?tab=${tab}&postar=1#postar`}
          scroll={false}
          aria-label="Compartilhar fotos de um jogo"
          className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-900/40 transition active:scale-95 md:hidden"
        >
          <Camera className="size-6" aria-hidden />
        </Link>
      )}
      <div className="min-w-0">
        {query.senha === "alterada" && (
          <p role="status" className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-3 text-sm text-emerald-100">
            Senha alterada com sucesso.
          </p>
        )}
        {onboarding && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-gradient-to-r from-brand-500/[0.08] to-ember-500/[0.08] p-4">
            <Link href="/bem-vindo" className="min-w-0 flex-1">
              <span className="block font-semibold text-zinc-50">Primeiros passos</span>
              <span className="block text-sm text-zinc-400">
                {onboarding.done} de {onboarding.total} feitos · vincule a Steam, escolha seu Top 4 e siga outros jogadores
              </span>
            </Link>
            <Link href="/bem-vindo" className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500">
              Continuar
            </Link>
            <DismissOnboarding />
          </div>
        )}
        {!viewer.bannedAt && <PhotoComposer
            quickGames={quickGames}
            startOpen={query.postar === "1"}
            shared={Number(query.compartilhado) > 0 ? { count: Number(query.compartilhado), text: query.texto?.slice(0, 500) ?? null } : null}
          />}

        <nav className="mb-4 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1 sm:mb-5" aria-label="Feed">
          <Tab href="/feed?tab=following" active={tab === "following"}>
            Seguindo
          </Tab>
          <Tab href="/feed?tab=foryou" active={tab === "foryou"}>
            Para você
          </Tab>
          <Tab href="/feed?tab=global" active={tab === "global"}>
            Global
          </Tab>
        </nav>

        {items.length === 0 ? (
          <EmptyFeed tab={tab} />
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <ActivityCard key={item.id} item={item} viewerId={viewer.id} />
            ))}
          </div>
        )}

        {olderHref && (
          <div className="mt-6 text-center">
            <Link href={olderHref} className="text-sm font-medium text-brand-400 hover:underline">
              {tab === "foryou" ? "Ver mais" : "Mais antigas"}
            </Link>
          </div>
        )}
      </div>

      {/* No computador a lateral acompanha a rolagem do feed */}
      <aside className="scrollbar-none space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-4">
        <Link
          href="/games"
          className="hidden items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 md:flex"
        >
          <Search className="size-4" aria-hidden />
          Compartilhar um jogo
        </Link>

        {/* Mensagens: no celular já ficam no ícone do topo */}
        <section className="hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur-sm lg:block">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Mail className="size-4 text-brand-400" aria-hidden /> Mensagens
            <Link href="/mensagens" className="ml-auto text-xs font-normal text-brand-400 hover:underline">
              Ver todas
            </Link>
          </h2>
          {conversations.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nenhuma conversa ainda. Abra um perfil e toque em <span className="text-zinc-300">Mensagem</span>.
            </p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {conversations.map(({ id, other, last, unread }) => {
                const name = other.displayName ?? other.username;
                return (
                  <li key={id}>
                    <Link
                      href={`/mensagens/${other.username}`}
                      className={`flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-zinc-800/70 ${unread ? "bg-brand-500/[0.07]" : ""}`}
                    >
                      <Avatar name={name} src={other.avatarUrl ?? other.steamAvatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={`truncate text-sm ${unread ? "font-bold text-zinc-50" : "font-medium text-zinc-100"}`}>{name}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-zinc-500">{relativeTime(last.createdAt)}</span>
                        </span>
                        <span className={`block truncate text-xs ${unread ? "text-zinc-200" : "text-zinc-500"}`}>
                          {last.senderId === viewer.id && "Você: "}
                          {last.body || "📷 Foto"}
                        </span>
                      </span>
                      {unread && <span className="size-2 shrink-0 rounded-full bg-brand-400" aria-label="Não lida" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/mensagens"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
          >
            <PenSquare className="size-4" aria-hidden /> Nova mensagem
          </Link>
        </section>

        {/* Cada card carrega sozinho (o da Steam pode demorar) e some quando não tem nada */}
        <div className="hidden space-y-6 lg:block">
          <Suspense fallback={null}>
            <NowPlayingCard viewerId={viewer.id} />
          </Suspense>
          <Suspense fallback={null}>
            <ReleasesCard userId={viewer.id} />
          </Suspense>
          <Suspense fallback={null}>
            <DealsCard userId={viewer.id} />
          </Suspense>
          <Suspense fallback={null}>
            <PopularListsCard viewerId={viewer.id} />
          </Suspense>
        </div>

        {suggestions.length > 0 && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Users className="size-4" aria-hidden /> Quem seguir
            </h2>
            <ul className="space-y-3">
              {suggestions.map((u) => (
                <li key={u.username}>
                  <Link href={`/u/${u.username}`} className="flex items-center gap-3 rounded-lg hover:bg-zinc-800/60">
                    <Avatar name={u.displayName ?? u.username} src={u.avatarUrl ?? u.steamAvatarUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-100">{u.displayName ?? u.username}</span>
                      <span className="block truncate text-xs text-zinc-500">@{u.username}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </main>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
        active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </Link>
  );
}

function EmptyFeed({ tab }: { tab: FeedTab }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">
      {tab === "foryou" ? (
        <>
          Nada em alta nesta semana ainda.{" "}
          <Link href="/feed?tab=global" className="text-brand-400 hover:underline">
            Veja tudo no Global
          </Link>
          .
        </>
      ) : tab === "following" ? (
        <>
          Ninguém que você segue publicou ainda.{" "}
          <Link href="/feed?tab=global" className="text-brand-400 hover:underline">
            Veja o feed global
          </Link>{" "}
          e siga outros jogadores.
        </>
      ) : (
        <>
          O feed está vazio.{" "}
          <Link href="/games" className="text-brand-400 hover:underline">
            Compartilhe o primeiro jogo
          </Link>{" "}
          ou vincule sua Steam em{" "}
          <Link href="/settings/profile" className="text-brand-400 hover:underline">
            Contas vinculadas
          </Link>
          .
        </>
      )}
    </div>
  );
}
