import "server-only";
import { prisma } from "@/lib/prisma";
import { getPrices } from "@/lib/steam/api";

/**
 * Confere o preço de todo jogo que está na wishlist de alguém e avisa quem quer
 * jogar quando entra em promoção. Um aviso por promoção: só avisa de novo se o preço
 * cair mais, ou depois que a promoção acabar e outra começar. Chamado pelo cron diário.
 */
export async function checkWishlistDeals() {
  const games = await prisma.game.findMany({
    where: { steamAppId: { not: null }, wishlistedBy: { some: {} } },
    select: { id: true, steamAppId: true },
  });
  if (games.length === 0) return { checked: 0, notified: 0 };

  const prices = await getPrices(games.map((g) => g.steamAppId!));
  const now = new Date();
  let notified = 0;

  for (const game of games) {
    if (!prices.has(game.steamAppId!)) continue;
    const price = prices.get(game.steamAppId!) ?? null;

    await prisma.game.update({
      where: { id: game.id },
      data: {
        priceFinal: price?.final ?? null,
        priceOriginal: price?.original ?? null,
        discountPercent: price?.discountPercent ?? null,
        priceCheckedAt: now,
      },
    });

    if (!price || price.discountPercent <= 0) {
      // Promoção acabou: a próxima volta a avisar
      await prisma.wishlistItem.updateMany({ where: { gameId: game.id, notifiedPrice: { not: null } }, data: { notifiedPrice: null } });
      continue;
    }

    const toNotify = await prisma.wishlistItem.findMany({
      where: { gameId: game.id, OR: [{ notifiedPrice: null }, { notifiedPrice: { gt: price.final } }] },
      select: { userId: true },
    });
    if (toNotify.length === 0) continue;

    await prisma.$transaction([
      prisma.notification.createMany({ data: toNotify.map((w) => ({ userId: w.userId, type: "DEAL" as const, gameId: game.id })) }),
      prisma.wishlistItem.updateMany({
        where: { gameId: game.id, userId: { in: toNotify.map((w) => w.userId) } },
        data: { notifiedPrice: price.final },
      }),
    ]);
    notified += toNotify.length;
  }

  return { checked: games.length, notified };
}
