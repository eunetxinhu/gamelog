import "server-only";
import { prisma } from "@/lib/prisma";
import { extractMentions } from "@/lib/mentions";
import { notify } from "@/lib/notifications";

/**
 * Notifica quem foi mencionado com @ num texto ligado a uma publicação (review ou comentário).
 * `skip`: quem já vai receber outra notificação pelo mesmo motivo (ex.: o dono do post no comentário).
 */
export async function notifyMentions(actorId: string, text: string | null | undefined, activityId: string, skip: string[] = []) {
  if (!text) return;
  const usernames = extractMentions(text);
  if (usernames.length === 0) return;
  const users = await prisma.user.findMany({ where: { username: { in: usernames }, bannedAt: null }, select: { id: true } });
  for (const u of users) {
    if (u.id === actorId || skip.includes(u.id)) continue;
    await notify(prisma, { userId: u.id, actorId, type: "MENTION", activityId });
  }
}
