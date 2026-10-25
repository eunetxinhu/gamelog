import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { CreateClubForm } from "./_components/club-forms";

export const metadata: Metadata = { title: "Clubes" };

const clubSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  imageUrl: true,
  _count: { select: { members: true, posts: true } },
} as const;

/** Meus clubes + clubes mais movimentados. */
export default async function ClubsPage() {
  const viewer = await getCurrentUser();
  const [mine, popular] = await Promise.all([
    viewer
      ? prisma.club.findMany({ where: { members: { some: { userId: viewer.id } } }, orderBy: { createdAt: "desc" }, select: clubSelect })
      : [],
    prisma.club.findMany({
      where: { owner: { bannedAt: null }, ...(viewer ? { members: { none: { userId: viewer.id } } } : {}) },
      orderBy: [{ members: { _count: "desc" } }, { posts: { _count: "desc" } }],
      take: 30,
      select: clubSelect,
    }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-50">
            <Users className="size-6 text-brand-400" aria-hidden /> Clubes
          </h1>
          <p className="text-sm text-zinc-400">Grupos para conversar sobre um jogo, um gênero ou caça de platinas.</p>
        </div>
        {viewer && <CreateClubForm />}
      </div>

      {mine.length > 0 && <ClubGrid title="Meus clubes" clubs={mine} />}
      <ClubGrid title={mine.length ? "Descobrir" : "Clubes"} clubs={popular} empty="Nenhum clube ainda. Crie o primeiro!" />
    </main>
  );
}

function ClubGrid({
  title,
  clubs,
  empty,
}: {
  title: string;
  clubs: { id: string; slug: string; name: string; description: string | null; imageUrl: string | null; _count: { members: number; posts: number } }[];
  empty?: string;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold text-zinc-50">{title}</h2>
      {clubs.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {clubs.map((c) => (
            <li key={c.id}>
              <Link href={`/clubes/${c.slug}`} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-600">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-700 to-ember-700 text-xl font-bold text-white">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-zinc-100">{c.name}</span>
                  {c.description && <span className="line-clamp-1 block text-sm text-zinc-400">{c.description}</span>}
                  <span className="block text-xs text-zinc-500">
                    {c._count.members} {c._count.members === 1 ? "membro" : "membros"} · {c._count.posts} publicações
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
