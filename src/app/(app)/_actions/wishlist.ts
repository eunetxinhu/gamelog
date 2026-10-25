"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateGame } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

/**
 * Botão rápido das listas: põe ou tira da wishlist sem abrir a página do jogo.
 * Recebe o estado desejado (e não "inverte"), para dois toques rápidos não se
 * desencontrarem. Jogos da loja que ainda não estão no GameLog são cadastrados aqui.
 */
export async function setWishlistBySlug(slug: string, on: boolean): Promise<{ ok: boolean; wishlisted?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Entre para usar a wishlist." };
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false };

  const limit = await rateLimit("wishlist", user.id);
  if (!limit.ok) return { ok: false, error: limit.message };

  const game = on ? await getOrCreateGame(slug) : await findExisting(slug);
  if (!game) return on ? { ok: false, error: "Não foi possível encontrar esse jogo." } : { ok: true, wishlisted: false };

  const key = { userId_gameId: { userId: user.id, gameId: game.id } };
  if (on) await prisma.wishlistItem.upsert({ where: key, create: { userId: user.id, gameId: game.id }, update: {} });
  else await prisma.wishlistItem.deleteMany({ where: { userId: user.id, gameId: game.id } });

  revalidatePath(`/u/${user.username}/jogos`);
  revalidatePath(`/games/${game.slug}`);
  return { ok: true, wishlisted: on };
}

/** Para tirar: o jogo já existe; os itens da loja chegam como "steam-<id>" mesmo quando o slug salvo é outro. */
function findExisting(slug: string) {
  const appId = slug.match(/^steam-(\d{1,10})$/)?.[1];
  return prisma.game.findFirst({
    where: { OR: [{ slug }, ...(appId ? [{ steamAppId: Number(appId) }] : [])] },
    select: { id: true, slug: true },
  });
}
