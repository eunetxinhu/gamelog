"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";

const COMMENT_MAX = 1000;

/** Curte / descurte uma publicação. Devolve o estado final. */
export async function toggleLike(activityId: string): Promise<{ ok: boolean; liked?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const key = { activityId_userId: { activityId, userId: user.id } };
  const existing = await prisma.activityLike.findUnique({ where: key });
  try {
    if (existing) await prisma.activityLike.delete({ where: key });
    else {
      const like = await prisma.activityLike.create({
        data: { activityId, userId: user.id },
        select: { activity: { select: { userId: true } } },
      });
      await notify(prisma, { userId: like.activity.userId, actorId: user.id, type: "LIKE", activityId });
    }
  } catch (err) {
    // Clique duplo (P2002) ou publicação apagada (P2003/P2025): o estado final já é o certo
    if (err instanceof Prisma.PrismaClientKnownRequestError) return { ok: true, liked: !existing };
    throw err;
  }
  return { ok: true, liked: !existing };
}

/** Apaga uma publicação própria. */
export async function deleteActivity(activityId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const { count } = await prisma.activity.deleteMany({ where: { id: activityId, userId: user.id } });
  revalidatePath("/feed");
  revalidatePath(`/u/${user.username}`);
  return { ok: count > 0 };
}

/** Segue / deixa de seguir. Devolve o estado final. */
export async function toggleFollow(targetUserId: string): Promise<{ ok: boolean; following?: boolean }> {
  const user = await getCurrentUser();
  if (!user || user.id === targetUserId) return { ok: false };

  const key = { followerId_followingId: { followerId: user.id, followingId: targetUserId } };
  const existing = await prisma.follow.findUnique({ where: key });
  try {
    if (existing) await prisma.follow.delete({ where: key });
    else {
      await prisma.follow.create({ data: { followerId: user.id, followingId: targetUserId } });
      await notify(prisma, { userId: targetUserId, actorId: user.id, type: "FOLLOW" });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) return { ok: true, following: !existing };
    throw err;
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true } });
  if (target) revalidatePath(`/u/${target.username}`);
  revalidatePath("/feed");
  return { ok: true, following: !existing };
}

export type CommentResult =
  | {
      ok: true;
      comment: { id: string; body: string; createdAt: string; user: { id: string; username: string; displayName: string | null; avatarUrl: string | null } };
    }
  | { ok: false; message: string };

/** Comenta numa publicação e avisa o dono dela. */
export async function addComment(activityId: string, rawBody: string): Promise<CommentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login para comentar." };

  const body = rawBody.trim();
  if (!body) return { ok: false, message: "Escreva alguma coisa." };
  if (body.length > COMMENT_MAX) return { ok: false, message: `Máximo de ${COMMENT_MAX} caracteres.` };

  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: { userId: true } });
  if (!activity) return { ok: false, message: "Essa publicação foi apagada." };

  const comment = await prisma.comment.create({ data: { activityId, userId: user.id, body } });
  await notify(prisma, { userId: activity.userId, actorId: user.id, type: "COMMENT", activityId });
  revalidatePath(`/p/${activityId}`);

  return {
    ok: true,
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl ?? user.steamAvatarUrl },
    },
  };
}

/** Apaga um comentário: o autor do comentário ou o dono da publicação podem. */
export async function deleteComment(commentId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const { count } = await prisma.comment.deleteMany({
    where: { id: commentId, OR: [{ userId: user.id }, { activity: { userId: user.id } }] },
  });
  return { ok: count > 0 };
}

/** Marca todas as notificações como lidas. */
export async function markNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
}
