import "server-only";
import { prisma } from "@/lib/prisma";
import { lookupTerms, wishlistKeySet, type GameRef } from "@/lib/wishlist-keys";

/**
 * Quais dos jogos exibidos já estão na wishlist de quem está vendo. Uma consulta só,
 * por slug ou appId da Steam (os itens da loja ainda podem nem existir no banco).
 */
export async function wishlistSetFor(userId: string | null | undefined, games: GameRef[]): Promise<Set<string>> {
  if (!userId || games.length === 0) return new Set();
  const { slugs, appIds } = lookupTerms(games);
  const items = await prisma.wishlistItem.findMany({
    where: { userId, game: { OR: [{ slug: { in: slugs } }, ...(appIds.length ? [{ steamAppId: { in: appIds } }] : [])] } },
    select: { game: { select: { slug: true, steamAppId: true } } },
  });
  return wishlistKeySet(items.map((i) => i.game));
}
