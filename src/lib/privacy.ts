import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** Ids de quem eu bloqueei + de quem me bloqueou (some dos dois lados). */
export async function blockedIds(viewerId: string | null): Promise<string[]> {
  if (!viewerId) return [];
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)))];
}

export async function isBlockedEitherWay(a: string, b: string) {
  const n = await prisma.block.count({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return n > 0;
}

/**
 * Filtro de "de quem posso ver o conteúdo": não suspenso, sem bloqueio entre nós e,
 * se o perfil for privado, só se eu for seguidor aprovado (ou o próprio dono).
 */
export async function visibleUsersWhere(viewerId: string | null): Promise<Prisma.UserWhereInput> {
  const blocked = await blockedIds(viewerId);
  return {
    bannedAt: null,
    ...(blocked.length ? { id: { notIn: blocked } } : {}),
    OR: [
      { isPrivate: false },
      ...(viewerId ? [{ id: viewerId }, { followers: { some: { followerId: viewerId, status: "ACCEPTED" as const } } }] : []),
    ],
  };
}

/** O visitante pode ver atividade, biblioteca e listas deste perfil? */
export async function canSeeProfile(viewerId: string | null, profile: { id: string; isPrivate: boolean; bannedAt: Date | null }) {
  if (viewerId === profile.id) return true;
  if (profile.bannedAt) return false;
  if (viewerId && (await isBlockedEitherWay(viewerId, profile.id))) return false;
  if (!profile.isPrivate) return true;
  if (!viewerId) return false;
  const f = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: profile.id } },
    select: { status: true },
  });
  return f?.status === "ACCEPTED";
}
