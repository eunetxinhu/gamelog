import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Shield } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { blockedIds } from "@/lib/privacy";
import { relativeTime } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { MentionText } from "@/components/mention-text";
import { ReportButton } from "@/components/report-button";
import { ClubComposer, DeleteClubButton, DeleteClubPostButton, MembershipButton } from "../_components/club-forms";

type Props = { params: Promise<{ slug: string }> };

const userSelect = { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await prisma.club.findUnique({ where: { slug: (await params).slug }, select: { name: true, description: true } });
  return { title: `${club?.name ?? "Clube"} · GameLog`, description: club?.description ?? undefined };
}

export default async function ClubPage({ params }: Props) {
  const { slug } = await params;
  const viewer = await getCurrentUser();
  const club = await prisma.club.findUnique({
    where: { slug },
    include: { _count: { select: { members: true } } },
  });
  if (!club) notFound();

  const hidden = await blockedIds(viewer?.id ?? null);
  const [membership, posts, members] = await Promise.all([
    viewer ? prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: viewer.id } }, select: { role: true } }) : null,
    prisma.clubPost.findMany({
      where: { clubId: club.id, user: { bannedAt: null, id: { notIn: hidden } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: userSelect } },
    }),
    prisma.clubMember.findMany({
      where: { clubId: club.id },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      take: 24,
      select: { role: true, user: { select: userSelect } },
    }),
  ]);
  const canModerate = membership?.role === "OWNER" || membership?.role === "ADMIN" || viewer?.isAdmin;

  return (
    <main className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
      <Link href="/clubes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> Clubes
      </Link>

      <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:mb-8 sm:flex-row sm:items-center sm:p-5">
        {club.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.imageUrl} alt="" className="size-20 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-700 to-violet-700 text-3xl font-bold text-white">
            {club.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-zinc-50">{club.name}</h1>
          {club.description && <p className="mt-1 whitespace-pre-line text-sm text-zinc-400">{club.description}</p>}
          <p className="mt-1 text-xs text-zinc-500">
            {club._count.members} {club._count.members === 1 ? "membro" : "membros"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {membership?.role !== "OWNER" && <MembershipButton clubId={club.id} member={Boolean(membership)} loggedIn={Boolean(viewer)} />}
          {(membership?.role === "OWNER" || viewer?.isAdmin) && <DeleteClubButton clubId={club.id} />}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_240px] lg:gap-8">
        <section className="min-w-0 space-y-4">
          {membership && !viewer?.bannedAt && <ClubComposer clubId={club.id} />}
          {posts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              {membership ? "Nada por aqui ainda. Comece a conversa!" : "Entre no clube para participar."}
            </p>
          ) : (
            posts.map((p) => {
              const name = p.user.displayName ?? p.user.username;
              return (
                <article key={p.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <header className="mb-2 flex items-center gap-3">
                    <Link href={`/u/${p.user.username}`}>
                      <Avatar name={name} src={p.user.avatarUrl ?? p.user.steamAvatarUrl} size="sm" />
                    </Link>
                    <div className="min-w-0 flex-1 text-sm">
                      <Link href={`/u/${p.user.username}`} className="font-semibold text-zinc-100 hover:underline">
                        {name}
                      </Link>
                      <p className="text-xs text-zinc-500">{relativeTime(p.createdAt)}</p>
                    </div>
                    {viewer && viewer.id !== p.user.id && <ReportButton targetType="CLUB_POST" targetId={p.id} />}
                    {viewer && (viewer.id === p.user.id || canModerate) && <DeleteClubPostButton postId={p.id} />}
                  </header>
                  {p.body && <MentionText text={p.body} className="block whitespace-pre-line break-words text-sm text-zinc-200" />}
                  {p.imageUrl && (
                    <a href={p.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block sm:w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt="" loading="lazy" className="max-h-96 w-full rounded-xl object-contain ring-1 ring-white/10 sm:w-auto" />
                    </a>
                  )}
                </article>
              );
            })
          )}
        </section>

        {/* Celular: fileira de avatares acima do mural. Computador: lista na lateral */}
        <aside className="order-first min-w-0 lg:order-none">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 lg:mb-3">Membros</h2>
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-2 lg:px-0">
            {members.map(({ role, user }) => (
              <li key={user.id} className="shrink-0">
                <Link
                  href={`/u/${user.username}`}
                  className="flex w-16 flex-col items-center gap-1 rounded-lg p-1 hover:bg-zinc-800/60 lg:w-auto lg:flex-row lg:gap-2"
                >
                  <Avatar name={user.displayName ?? user.username} src={user.avatarUrl ?? user.steamAvatarUrl} size="sm" />
                  <span className="w-full truncate text-center text-[11px] text-zinc-200 lg:min-w-0 lg:flex-1 lg:text-left lg:text-sm">
                    {user.displayName ?? user.username}
                  </span>
                  {role === "OWNER" && <Crown className="hidden size-3.5 text-amber-400 lg:block" aria-label="Dono" />}
                  {role === "ADMIN" && <Shield className="hidden size-3.5 text-sky-400 lg:block" aria-label="Admin" />}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
