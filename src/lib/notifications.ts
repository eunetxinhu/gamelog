import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Cria uma notificação. Ignora quando a pessoa age sobre si mesma e não repete
 * a mesma notificação ainda não lida (curtir/descurtir/curtir não gera três).
 */
export async function notify(
  db: Db,
  input: { userId: string; actorId: string; type: NotificationType; activityId?: string | null },
) {
  if (input.userId === input.actorId) return;
  if (input.type !== "COMMENT") {
    const dup = await db.notification.findFirst({
      where: { userId: input.userId, actorId: input.actorId, type: input.type, activityId: input.activityId ?? null, readAt: null },
      select: { id: true },
    });
    if (dup) return;
  }
  await db.notification.create({ data: { ...input, activityId: input.activityId ?? null } });
}

/** Avisa todos os seguidores de `actorId` (usado nas platinas). */
export async function notifyFollowers(db: Db, actorId: string, type: NotificationType, activityId: string) {
  const followers = await db.follow.findMany({ where: { followingId: actorId }, select: { followerId: true } });
  if (followers.length === 0) return;
  await db.notification.createMany({
    data: followers.map((f) => ({ userId: f.followerId, actorId, type, activityId })),
  });
}

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
