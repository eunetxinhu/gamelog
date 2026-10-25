import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { blockedIds, canSeeProfile } from "@/lib/privacy";
import { PeopleList, peopleSelect } from "@/components/people-list";

/** Quantas pessoas mostrar por página. */
const LIMIT = 200;

/**
 * Seguidores ou seguindo de um perfil. Perfil privado: só para seguidores aprovados
 * (e o dono). Contas suspensas e bloqueios (dos dois lados) ficam de fora.
 */
export async function FollowList({ username: raw, kind }: { username: string; kind: "seguidores" | "seguindo" }) {
  const username = decodeURIComponent(raw).toLowerCase();
  const [profile, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        isPrivate: true,
        bannedAt: true,
        _count: {
          select: {
            // Contas suspensas não entram na conta (também não aparecem nas listas)
            followers: { where: { status: "ACCEPTED", follower: { bannedAt: null } } },
            following: { where: { status: "ACCEPTED", following: { bannedAt: null } } },
          },
        },
      },
    }),
    getCurrentUser(),
  ]);
  if (!profile) notFound();
  const viewerId = viewer?.id ?? null;
  const allowed = await canSeeProfile(viewerId, profile);
  const name = profile.displayName ?? profile.username;

  const hidden = allowed ? await blockedIds(viewerId) : [];
  const rows = allowed
    ? kind === "seguidores"
      ? (
          await prisma.follow.findMany({
            where: { followingId: profile.id, status: "ACCEPTED", follower: { bannedAt: null, id: { notIn: hidden } } },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: { follower: { select: peopleSelect } },
          })
        ).map((f) => f.follower)
      : (
          await prisma.follow.findMany({
            where: { followerId: profile.id, status: "ACCEPTED", following: { bannedAt: null, id: { notIn: hidden } } },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: { following: { select: peopleSelect } },
          })
        ).map((f) => f.following)
    : [];

  const tab = (k: "seguidores" | "seguindo", label: string, n: number) => (
    <Link
      href={`/u/${profile.username}/${k}`}
      aria-current={kind === k ? "page" : undefined}
      className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
        kind === k ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      <strong className="tabular-nums">{n}</strong> {label}
    </Link>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
      <Link href={`/u/${profile.username}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> {name}
      </Link>
      <nav className="mb-5 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1" aria-label="Seguidores e seguindo">
        {tab("seguidores", profile._count.followers === 1 ? "seguidor" : "seguidores", profile._count.followers)}
        {tab("seguindo", "seguindo", profile._count.following)}
      </nav>

      {!allowed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
          <Lock className="size-8 text-zinc-500" aria-hidden />
          <p className="max-w-sm text-sm text-zinc-400">Este perfil é privado. Só seguidores aprovados veem quem segue e quem é seguido.</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          {kind === "seguidores" ? `Ninguém segue ${name} ainda.` : `${name} ainda não segue ninguém.`}
        </p>
      ) : (
        <>
          <PeopleList people={rows} viewerId={viewerId} />
          {rows.length === LIMIT && <p className="mt-4 text-center text-xs text-zinc-500">Mostrando as {LIMIT} mais recentes.</p>}
        </>
      )}
    </main>
  );
}
