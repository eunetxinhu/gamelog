import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActivities, PAGE_SIZE } from "@/lib/activity";
import { blockedIds } from "@/lib/privacy";
import { ActivityCard } from "@/components/activity-card";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "Feed · GameLog" };

type Props = { searchParams: Promise<{ tab?: string; before?: string; senha?: string }> };

export default async function FeedPage({ searchParams }: Props) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/feed");

  const query = await searchParams;
  const hidden = await blockedIds(viewer.id);
  const followingIds = (
    await prisma.follow.findMany({ where: { followerId: viewer.id, status: "ACCEPTED" }, select: { followingId: true } })
  ).map((f) => f.followingId);

  // Quem ainda não segue ninguém cai no Global por padrão
  const tab = query.tab === "global" || (query.tab !== "following" && followingIds.length === 0) ? "global" : "following";
  const before = query.before && !Number.isNaN(Date.parse(query.before)) ? new Date(query.before) : undefined;

  const [items, suggestions] = await Promise.all([
    getActivities({
      where: tab === "following" ? { userId: { in: [...followingIds, viewer.id] } } : undefined,
      viewerId: viewer.id,
      before,
    }),
    // Quem seguir: usuários com publicações recentes que você ainda não segue
    prisma.user.findMany({
      where: { id: { notIn: [...followingIds, viewer.id, ...hidden] }, bannedAt: null, activities: { some: {} } },
      orderBy: { activities: { _count: "desc" } },
      take: 5,
      select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true },
    }),
  ]);

  const olderHref =
    items.length === PAGE_SIZE ? `/feed?tab=${tab}&before=${encodeURIComponent(items[items.length - 1].createdAt.toISOString())}` : null;

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-4 sm:py-8 lg:grid-cols-[1fr_280px]">
      {/* Celular: botão flutuante de compartilhar, acima da barra inferior */}
      <Link
        href="/games"
        aria-label="Compartilhar um jogo"
        className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-900/40 transition active:scale-95 md:hidden"
      >
        <Plus className="size-7" aria-hidden />
      </Link>
      <div className="min-w-0">
        {query.senha === "alterada" && (
          <p role="status" className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-3 text-sm text-emerald-100">
            Senha alterada com sucesso.
          </p>
        )}
        <nav className="mb-4 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1 sm:mb-5" aria-label="Feed">
          <Tab href="/feed?tab=following" active={tab === "following"}>
            Seguindo
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
            <Link href={olderHref} className="text-sm font-medium text-sky-400 hover:underline">
              Mais antigas
            </Link>
          </div>
        )}
      </div>

      <aside className="space-y-6">
        <Link
          href="/games"
          className="hidden items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 md:flex"
        >
          <Search className="size-4" aria-hidden />
          Compartilhar um jogo
        </Link>

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

function EmptyFeed({ tab }: { tab: "following" | "global" }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">
      {tab === "following" ? (
        <>
          Ninguém que você segue publicou ainda.{" "}
          <Link href="/feed?tab=global" className="text-sky-400 hover:underline">
            Veja o feed global
          </Link>{" "}
          e siga outros jogadores.
        </>
      ) : (
        <>
          O feed está vazio.{" "}
          <Link href="/games" className="text-sky-400 hover:underline">
            Compartilhe o primeiro jogo
          </Link>{" "}
          ou vincule sua Steam em{" "}
          <Link href="/settings/profile" className="text-sky-400 hover:underline">
            Contas vinculadas
          </Link>
          .
        </>
      )}
    </div>
  );
}
