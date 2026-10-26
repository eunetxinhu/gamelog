"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** Coloca / tira o jogo da wishlist (quero comprar). Devolve o estado final. */
export async function toggleWishlist(gameId: string): Promise<{ ok: boolean; wishlisted?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const key = { userId_gameId: { userId: user.id, gameId } };
  const existing = await prisma.wishlistItem.findUnique({ where: key });
  if (existing) await prisma.wishlistItem.delete({ where: key });
  else {
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!game) return { ok: false };
    await prisma.wishlistItem.upsert({ where: key, create: { userId: user.id, gameId }, update: {} });
  }

  revalidatePath(`/u/${user.username}/jogos`);
  return { ok: true, wishlisted: !existing };
}
