import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canSeeProfile } from "@/lib/privacy";
import { ArrowLeft, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getProgression, XP_RULES } from "@/lib/progression";
import { LevelBadge } from "@/components/level-badge";
import { awardLook } from "@/lib/awards";
import { AwardPill } from "@/components/user-title";
import { SITE_NAME } from "@/lib/brand";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Selos de @${decodeURIComponent((await params).username)}` };
}

/** Nível, de onde vem o XP e todos os selos (conquistados e por conquistar). */
export default async function BadgesPage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const profile = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      isPrivate: true,
      bannedAt: true,
      awards: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, description: true, icon: true, style: true, createdAt: true } },
    },
  });
  if (!profile) notFound();
  if (!(await canSeeProfile((await getCurrentUser())?.id ?? null, profile))) redirect(`/u/${profile.username}`);

  const { stats, level, badges } = await getProgression(profile.id);
  const name = profile.displayName ?? profile.username;
  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned).sort((a, b) => b.value / b.target - a.value / a.target);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/u/${profile.username}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> {name}
      </Link>
      <h1 className="mb-5 text-2xl font-bold text-zinc-50">Nível e selos</h1>

      <section className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <LevelBadge level={level} />
        <p className="mt-3 text-sm text-zinc-400">
          Faltam <strong className="text-zinc-200">{(level.next - level.xp).toLocaleString("pt-BR")} XP</strong> para o nível {level.level + 1}.
        </p>
        <h2 className="mb-2 mt-5 text-sm font-medium text-zinc-300">De onde vem o XP</h2>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {XP_RULES.map((r) => {
            const n = r.of(stats);
            return (
              <li key={r.label} className="flex justify-between gap-3 rounded-lg bg-zinc-950/50 px-3 py-1.5">
                <span className="text-zinc-400">
                  {r.label} <span className="text-zinc-600">· {r.xp} XP</span>
                </span>
                <span className="tabular-nums text-zinc-200">{(n * r.xp).toLocaleString("pt-BR")}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {profile.awards.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-semibold text-zinc-50">Selos exclusivos</h2>
          <p className="mb-3 text-sm text-zinc-500">Dados pela moderação do {SITE_NAME}. Não dá para conquistar sozinho.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {profile.awards.map((b) => {
              const look = awardLook(b.icon, b.style);
              return (
                <li key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <AwardPill text={b.name} icon={look.icon} style={look.style} />
                  {b.description && <p className="mt-2 text-sm text-zinc-300">{b.description}</p>}
                  <p className="mt-1 text-xs text-zinc-500">Recebido em {b.createdAt.toLocaleDateString("pt-BR")}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-lg font-semibold text-zinc-50">
        Conquistados <span className="text-zinc-500">({earned.length}/{badges.length})</span>
      </h2>
      {earned.length === 0 ? (
        <p className="mb-8 text-sm text-zinc-500">Nenhum selo ainda.</p>
      ) : (
        <ul className="mb-8 grid gap-3 sm:grid-cols-2">
          {earned.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
              <span className="text-3xl" aria-hidden>
                {b.emoji}
              </span>
              <span>
                <span className="block font-semibold text-zinc-50">{b.name}</span>
                <span className="block text-sm text-zinc-400">{b.description}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {locked.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Por conquistar</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {locked.map((b) => {
              const pct = Math.min(100, Math.round((b.value / b.target) * 100));
              return (
                <li key={b.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl opacity-40 grayscale" aria-hidden>
                      {b.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                        <Lock className="size-3.5 text-zinc-500" aria-hidden /> {b.name}
                      </span>
                      <span className="block text-sm text-zinc-500">{b.description}</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="tabular-nums">
                      {Math.min(b.value, b.target).toLocaleString("pt-BR")}/{b.target.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
