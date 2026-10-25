import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronRight, Gamepad2, ScrollText, Star, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { blockedIds } from "@/lib/privacy";
import { onboardingSteps, FOLLOW_GOAL } from "@/lib/onboarding";
import { SITE_NAME } from "@/lib/brand";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { UserTitle } from "@/components/user-title";
import { FinishOnboarding } from "./_components/finish-button";

export const metadata: Metadata = { title: "Primeiros passos" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/bem-vindo");

  const [favorites, followingIds, hidden] = await Promise.all([
    prisma.favoriteGame.count({ where: { userId: user.id } }),
    prisma.follow.findMany({ where: { followerId: user.id }, select: { followingId: true, status: true } }),
    blockedIds(user.id),
  ]);
  const accepted = followingIds.filter((f) => f.status === "ACCEPTED").length;
  const { steps, done, total } = onboardingSteps({ hasSteam: Boolean(user.steamId), favorites, following: accepted });

  // Sugestões: quem tem título especial primeiro, depois os mais seguidos e ativos
  const suggestions = await prisma.user.findMany({
    where: { id: { notIn: [user.id, ...followingIds.map((f) => f.followingId), ...hidden] }, bannedAt: null },
    orderBy: [{ title: { sort: "asc", nulls: "last" } }, { followers: { _count: "desc" } }, { activities: { _count: "desc" } }],
    take: 6,
    select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, bio: true, isPrivate: true, title: true },
  });

  const href = { steam: "/settings/profile", top4: "/settings/account#top4", follow: "#seguir" } as const;
  const icon = { steam: Gamepad2, top4: Star, follow: Users } as const;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <p className="text-sm font-medium text-sky-400">Bem-vindo ao {SITE_NAME}, {user.displayName ?? user.username}!</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-50 sm:text-3xl">Primeiros passos</h1>
      <p className="mt-2 text-sm text-zinc-400">Três coisas rápidas para seu perfil ganhar vida e o feed ter o que mostrar.</p>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        {done} de {total} feitos
      </p>

      <ol className="mt-5 space-y-2">
        {steps.map((s) => {
          const Icon = icon[s.id];
          return (
            <li key={s.id}>
              <Link
                href={href[s.id]}
                className={`flex items-center gap-3 rounded-2xl border p-4 transition ${
                  s.done ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                }`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${s.done ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
                  {s.done ? <Check className="size-5" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${s.done ? "text-emerald-200" : "text-zinc-100"}`}>{s.label}</span>
                  <span className="block text-xs text-zinc-500">
                    {s.id === "steam" && (s.done ? "Biblioteca, horas e platinas chegam sozinhas." : "Suas horas, conquistas e platinas aparecem sozinhas no perfil.")}
                    {s.id === "top4" && (s.done ? "Seus favoritos já estão no topo do perfil." : "Os 4 jogos que definem você, no topo do perfil.")}
                    {s.id === "follow" && `${Math.min(accepted, FOLLOW_GOAL)}/${FOLLOW_GOAL}: o feed "Seguindo" mostra o que essas pessoas jogam.`}
                  </span>
                </span>
                {!s.done && <ChevronRight className="size-4 shrink-0 text-zinc-500" aria-hidden />}
                <span className="sr-only">{s.done ? "(feito)" : "(pendente)"}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      {suggestions.length > 0 && (
        <section id="seguir" className="mt-8 scroll-mt-20">
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Quem seguir</h2>
          <ul className="divide-y divide-zinc-800/80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
            {suggestions.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={p.displayName ?? p.username} src={p.avatarUrl ?? p.steamAvatarUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-sm font-medium text-zinc-100">
                      {p.displayName ?? p.username}
                      <UserTitle title={p.title} compact />
                    </span>
                    <span className="block truncate text-xs text-zinc-500">{p.bio ?? `@${p.username}`}</span>
                  </span>
                </Link>
                <FollowButton userId={p.id} state={null} isPrivate={p.isPrivate} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-zinc-50">
          <ScrollText className="size-4 text-sky-400" aria-hidden /> Regras da comunidade
        </h2>
        <p className="mb-4 mt-1 text-sm text-zinc-400">
          Respeito, spoilers marcados, nada de spam e conquistas honestas.{" "}
          <Link href="/regras" className="text-sky-400 hover:underline">
            Leia as regras completas
          </Link>
          .
        </p>
        <FinishOnboarding />
      </section>
    </main>
  );
}
