import "server-only";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

/** Cookie com o @ de quem convidou (fluxo "Entrar com Steam", que passa pelo site da Steam). */
export const REF_COOKIE = "gl_ref";

/** @ válido de quem convidou, ou null. */
export function cleanRef(value: unknown): string | null {
  const ref = typeof value === "string" ? value.trim().toLowerCase().replace(/^@/, "") : "";
  return /^[a-z0-9_]{3,30}$/.test(ref) ? ref : null;
}

/** Acha quem convidou (não suspenso). */
export async function findInviter(ref: string | null) {
  if (!ref) return null;
  return prisma.user.findFirst({ where: { username: ref, bannedAt: null }, select: { id: true, isPrivate: true } });
}

/**
 * Conta nova veio de convite: segue quem convidou (pedido, se o perfil for privado)
 * e avisa quem convidou. Chamado logo depois de criar o perfil.
 */
export async function applyReferral(newUserId: string, inviter: { id: string; isPrivate: boolean }) {
  if (newUserId === inviter.id) return;
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: newUserId, followingId: inviter.id } },
    create: { followerId: newUserId, followingId: inviter.id, status: inviter.isPrivate ? "PENDING" : "ACCEPTED" },
    update: {},
  });
  await notify(prisma, { userId: inviter.id, actorId: newUserId, type: "INVITE_JOINED" });
}
