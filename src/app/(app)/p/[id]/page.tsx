import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActivities } from "@/lib/activity";
import { ActivityCard } from "@/components/activity-card";
import { Comments } from "./_components/comments";

type Props = { params: Promise<{ id: string }> };

const VERB = { STARTED_GAME: "começou a jogar", COMPLETED: "finalizou", PLATINUM: "platinou", DROPPED: "dropou", REVIEW: "avaliou" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const a = await prisma.activity.findUnique({
    where: { id },
    select: { type: true, review: true, user: { select: { username: true, displayName: true } }, game: { select: { title: true } } },
  });
  if (!a) return { title: "Publicação · GameLog" };
  const title = `${a.user.displayName ?? a.user.username} ${VERB[a.type]} ${a.game.title}`;
  return { title: `${title} · GameLog`, description: a.review?.slice(0, 160) ?? title, openGraph: { title } };
}

/** Uma publicação com os comentários (link das notificações e do compartilhamento). */
export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  const [item] = await getActivities({ where: { id }, viewerId: viewer?.id ?? null, take: 1 });
  if (!item) notFound();

  const comments = await prisma.comment.findMany({
    where: { activityId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } } },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <ActivityCard item={item} viewerId={viewer?.id ?? null} />
      <Comments
        activityId={id}
        activityOwnerId={item.user.id}
        viewer={
          viewer
            ? { id: viewer.id, username: viewer.username, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl ?? viewer.steamAvatarUrl }
            : null
        }
        initial={comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
          user: { id: c.user.id, username: c.user.username, displayName: c.user.displayName, avatarUrl: c.user.avatarUrl ?? c.user.steamAvatarUrl },
        }))}
      />
    </main>
  );
}
