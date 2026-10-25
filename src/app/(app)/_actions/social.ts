"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { isBlockedEitherWay } from "@/lib/privacy";
import { notifyMentions } from "@/lib/mention-notify";
import type { ReactionType } from "@/generated/prisma/enums";

const COMMENT_MAX = 1000;

/** Publicações que aceitam "GG" (conquistas, não reviews nem "começou a jogar"). */
const GG_TYPES = new Set(["PLATINUM", "COMPLETED"]);

/** Liga / desliga uma reação (curtida ou GG). Devolve o estado final. */
export async function toggleReaction(activityId: string, type: ReactionType): Promise<{ ok: boolean; active?: boolean }> {
  const user = await getCurrentUser();
  if (!user || user.bannedAt || (type !== "LIKE" && type !== "GG")) return { ok: false };

  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: { userId: true, type: true } });
  if (!activity || (type === "GG" && !GG_TYPES.has(activity.type))) return { ok: false };
  if (await isBlockedEitherWay(user.id, activity.userId)) return { ok: false };

  const key = { activityId_userId_type: { activityId, userId: user.id, type } };
  const existing = await prisma.activityLike.findUnique({ where: key });
  try {
    if (existing) await prisma.activityLike.delete({ where: key });
    else {
      await prisma.activityLike.create({ data: { activityId, userId: user.id, type } });
      await notify(prisma, { userId: activity.userId, actorId: user.id, type, activityId });
    }
  } catch (err) {
    // Clique duplo (P2002) ou publicação apagada (P2003/P2025): o estado final já é o certo
    if (err instanceof Prisma.PrismaClientKnownRequestError) return { ok: true, active: !existing };
    throw err;
  }
  return { ok: true, active: !existing };
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

export type FollowState = "ACCEPTED" | "PENDING" | null;

/**
 * Segue / deixa de seguir (ou cancela o pedido). Perfil privado vira pedido pendente,
 * que o dono aprova nas notificações. Devolve o estado final.
 */
export async function toggleFollow(targetUserId: string): Promise<{ ok: boolean; state?: FollowState; message?: string }> {
  const user = await getCurrentUser();
  if (!user || user.id === targetUserId) return { ok: false };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true, isPrivate: true } });
  if (!target) return { ok: false };
  if (await isBlockedEitherWay(user.id, targetUserId)) return { ok: false, message: "Não é possível seguir este perfil." };

  const key = { followerId_followingId: { followerId: user.id, followingId: targetUserId } };
  const existing = await prisma.follow.findUnique({ where: key });
  let state: FollowState;
  try {
    if (existing) {
      await prisma.follow.delete({ where: key });
      // Pedido cancelado: some da lista de pendências do dono
      if (existing.status === "PENDING") {
        await prisma.notification.deleteMany({ where: { userId: targetUserId, actorId: user.id, type: "FOLLOW_REQUEST" } });
      }
      state = null;
    } else {
      state = target.isPrivate ? "PENDING" : "ACCEPTED";
      await prisma.follow.create({ data: { followerId: user.id, followingId: targetUserId, status: state } });
      await notify(prisma, { userId: targetUserId, actorId: user.id, type: state === "PENDING" ? "FOLLOW_REQUEST" : "FOLLOW" });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) return { ok: true, state: existing ? null : target.isPrivate ? "PENDING" : "ACCEPTED" };
    throw err;
  }

  revalidatePath(`/u/${target.username}`);
  revalidatePath("/feed");
  return { ok: true, state };
}

/** Dono do perfil privado aprova ou recusa um pedido para seguir. */
export async function answerFollowRequest(followerId: string, accept: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const key = { followerId_followingId: { followerId, followingId: user.id } };
  const req = await prisma.follow.findUnique({ where: key });
  if (!req || req.status !== "PENDING") return { ok: false };

  if (accept) {
    await prisma.follow.update({ where: key, data: { status: "ACCEPTED" } });
    await notify(prisma, { userId: followerId, actorId: user.id, type: "FOLLOW" });
  } else {
    await prisma.follow.delete({ where: key });
  }
  await prisma.notification.deleteMany({ where: { userId: user.id, actorId: followerId, type: "FOLLOW_REQUEST" } });
  revalidatePath("/notifications");
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
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
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };

  const body = rawBody.trim();
  if (!body) return { ok: false, message: "Escreva alguma coisa." };
  if (body.length > COMMENT_MAX) return { ok: false, message: `Máximo de ${COMMENT_MAX} caracteres.` };

  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: { userId: true } });
  if (!activity) return { ok: false, message: "Essa publicação foi apagada." };
  if (await isBlockedEitherWay(user.id, activity.userId)) return { ok: false, message: "Não é possível comentar nesta publicação." };

  const comment = await prisma.comment.create({ data: { activityId, userId: user.id, body } });
  await notify(prisma, { userId: activity.userId, actorId: user.id, type: "COMMENT", activityId });
  await notifyMentions(user.id, body, activityId, [activity.userId]);
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
