import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { titleOf, titleSelect } from "@/lib/awards";
import { Avatar } from "./avatar";
import { FollowButton } from "./follow-button";
import { UserTitle } from "./user-title";

/** Campos que a lista de pessoas usa (para os `select` do Prisma). */
export const peopleSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  steamAvatarUrl: true,
  bio: true,
  isPrivate: true,
  ...titleSelect,
  _count: { select: { followers: { where: { status: "ACCEPTED" as const } } } },
} as const;

type Person = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  steamAvatarUrl: string | null;
  bio: string | null;
  isPrivate: boolean;
  title?: string | null;
  titleIcon?: string | null;
  titleStyle?: string | null;
  _count: { followers: number };
};

/** Cartões de pessoas com o botão de seguir (Explorar, seguidores, seguindo). */
export async function PeopleList({
  people,
  viewerId,
}: {
  people: Person[];
  viewerId: string | null;
}) {
  const followState = new Map(
    viewerId
      ? (
          await prisma.follow.findMany({
            where: { followerId: viewerId, followingId: { in: people.map((p) => p.id) } },
            select: { followingId: true, status: true },
          })
        ).map((f) => [f.followingId, f.status] as const)
      : [],
  );

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {people.map((p) => {
        const name = p.displayName ?? p.username;
        return (
          <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={name} src={p.avatarUrl ?? p.steamAvatarUrl} size="md" />
              <span className="min-w-0">
                <span className="flex items-center truncate font-semibold text-zinc-100">
                  <span className="truncate">{name}</span>
                  <UserTitle title={titleOf(p)} compact />
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  @{p.username} · {p._count.followers} {p._count.followers === 1 ? "seguidor" : "seguidores"}
                </span>
                {p.bio && <span className="mt-0.5 line-clamp-1 block text-xs text-zinc-400">{p.bio}</span>}
              </span>
            </Link>
            {viewerId && viewerId !== p.id && (
              <span className="shrink-0">
                <FollowButton userId={p.id} state={followState.get(p.id) ?? null} isPrivate={p.isPrivate} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

