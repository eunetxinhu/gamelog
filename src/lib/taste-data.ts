import "server-only";
import { prisma } from "@/lib/prisma";
import { visibleUsersWhere } from "@/lib/privacy";
import { compatibility, MIN_COMMON, recommend, stricterThan, topGenres } from "@/lib/taste";

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;

/** Notas (1–5) que a pessoa deu, por jogo. */
async function ratingsOf(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.gameLog.findMany({ where: { userId, rating: { not: null } }, select: { gameId: true, rating: true } });
  return new Map(rows.map((r) => [r.gameId, r.rating!]));
}

/** Compatibilidade de gosto entre quem vê e o perfil (null = poucos jogos em comum). */
export async function getCompatibility(viewerId: string, otherId: string) {
  if (viewerId === otherId) return null;
  const [mine, theirs] = await Promise.all([ratingsOf(viewerId), ratingsOf(otherId)]);
  const result = compatibility(mine, theirs);
  if (!result) return { score: null, common: [...mine.keys()].filter((id) => theirs.has(id)).length, loved: [], split: [] };
  const games = new Map(
    (await prisma.game.findMany({ where: { id: { in: [...result.loved, ...result.split] } }, select: gameSelect })).map((g) => [g.id, g]),
  );
  return {
    score: result.score,
    common: result.common,
    loved: result.loved.flatMap((id) => (games.get(id) ? [games.get(id)!] : [])).slice(0, 6),
    split: result.split.flatMap((id) => (games.get(id) ? [games.get(id)!] : [])).slice(0, 6),
  };
}

/**
 * Recomendações: jogos bem avaliados por quem tem gosto parecido (compatibilidade acima
 * de 50%) que a pessoa ainda não registrou, não tem e não pôs na wishlist. Sem vizinhos
 * suficientes, completa com os mais bem avaliados da comunidade nos gêneros favoritos.
 */
export async function getRecommendations(userId: string, take = 12) {
  const [mine, owned, logged, wished] = await Promise.all([
    ratingsOf(userId),
    prisma.libraryEntry.findMany({ where: { userId }, select: { gameId: true, playtimeMinutes: true, game: { select: { genres: true } } } }),
    prisma.gameLog.findMany({ where: { userId }, select: { gameId: true, game: { select: { genres: true } } } }),
    prisma.wishlistItem.findMany({ where: { userId }, select: { gameId: true } }),
  ]);
  const exclude = new Set([...owned.map((o) => o.gameId), ...logged.map((l) => l.gameId), ...wished.map((w) => w.gameId)]);

  let picks: { gameId: string; reason: string }[] = [];
  if (mine.size >= MIN_COMMON) {
    // Quem avaliou algum dos meus jogos (visível para mim)
    const visible = await visibleUsersWhere(userId);
    const others = await prisma.gameLog.findMany({
      where: { gameId: { in: [...mine.keys()] }, rating: { not: null }, userId: { not: userId }, user: visible },
      select: { userId: true },
      distinct: ["userId"],
      take: 300,
    });
    const theirRows = await prisma.gameLog.findMany({
      where: { userId: { in: others.map((o) => o.userId) }, rating: { not: null } },
      select: { userId: true, gameId: true, rating: true },
    });
    const byUser = new Map<string, Map<string, number>>();
    for (const r of theirRows) {
      const m = byUser.get(r.userId) ?? new Map<string, number>();
      m.set(r.gameId, r.rating!);
      byUser.set(r.userId, m);
    }
    const neighbors = [...byUser.values()].flatMap((ratings) => {
      const c = compatibility(mine, ratings);
      return c && c.score > 50 ? [{ similarity: (c.score - 50) / 50, ratings }] : [];
    });
    picks = recommend(neighbors, exclude, take).map((r) => ({ gameId: r.gameId, reason: r.votes > 1 ? `${r.votes} jogadores com gosto parecido curtiram` : "Alguém com gosto parecido curtiu" }));
  }

  if (picks.length < take) {
    const genres = topGenres([
      ...owned.map((o) => ({ genres: o.game.genres, minutes: o.playtimeMinutes })),
      ...logged.map((l) => ({ genres: l.game.genres, minutes: 60 })),
    ], 3).map((g) => g.genre);
    const already = new Set([...exclude, ...picks.map((p) => p.gameId)]);
    const best = await prisma.gameLog.groupBy({
      by: ["gameId"],
      where: { rating: { gte: 4 }, gameId: { notIn: [...already] }, ...(genres.length ? { game: { genres: { hasSome: genres } } } : {}) },
      _count: { rating: true },
      _avg: { rating: true },
      orderBy: [{ _count: { rating: "desc" } }, { _avg: { rating: "desc" } }],
      take: take - picks.length,
    });
    picks.push(...best.map((b) => ({ gameId: b.gameId, reason: genres.length ? `Bem avaliado em ${genres[0]}` : "Bem avaliado pela comunidade" })));
  }

  const games = new Map((await prisma.game.findMany({ where: { id: { in: picks.map((p) => p.gameId) } }, select: gameSelect })).map((g) => [g.id, g]));
  return picks.flatMap((p) => (games.get(p.gameId) ? [{ game: games.get(p.gameId)!, reason: p.reason }] : []));
}

/** Gêneros favoritos (pelas horas) e como a pessoa avalia comparada com a comunidade. */
export async function getTasteStats(userId: string) {
  const [library, logs, mine, communityAvg, perUser] = await Promise.all([
    prisma.libraryEntry.findMany({ where: { userId }, select: { gameId: true, playtimeMinutes: true, game: { select: { genres: true } } } }),
    prisma.gameLog.findMany({ where: { userId }, select: { gameId: true, game: { select: { genres: true } } } }),
    prisma.gameLog.aggregate({ where: { userId, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.gameLog.aggregate({ where: { rating: { not: null } }, _avg: { rating: true } }),
    prisma.gameLog.groupBy({ by: ["userId"], where: { rating: { not: null } }, _avg: { rating: true }, _count: { rating: true }, having: { rating: { _count: { gte: MIN_COMMON } } } }),
  ]);
  const owned = new Set(library.map((l) => l.gameId));
  const genres = topGenres([
    ...library.map((l) => ({ genres: l.game.genres, minutes: l.playtimeMinutes })),
    ...logs.filter((l) => !owned.has(l.gameId)).map((l) => ({ genres: l.game.genres, minutes: 60 })),
  ]);
  const myAvg = mine._avg.rating;
  const enough = mine._count.rating >= MIN_COMMON && myAvg !== null;
  return {
    genres,
    ratings: mine._count.rating,
    myAverage: myAvg,
    communityAverage: communityAvg._avg.rating,
    stricterThan: enough ? stricterThan(myAvg, perUser.filter((u) => u.userId !== userId).map((u) => u._avg.rating ?? 0)) : null,
  };
}
