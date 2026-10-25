// Casamento entre o que está na wishlist e os jogos de uma lista. O mesmo jogo pode
// aparecer pelo slug do GameLog ("hades") ou pelo da loja ("steam-1145360"), então
// os dois contam.

export type GameRef = { slug: string; steamAppId: number | null };

/** Chaves de um jogo: o slug e, se tiver, "steam-<appId>". */
export function keysOf(game: GameRef): string[] {
  return game.steamAppId ? [game.slug, `steam-${game.steamAppId}`] : [game.slug];
}

/** Conjunto com as chaves de todos os jogos da wishlist. */
export function wishlistKeySet(items: GameRef[]): Set<string> {
  return new Set(items.flatMap(keysOf));
}

export function inWishlist(set: Set<string>, game: GameRef): boolean {
  return keysOf(game).some((k) => set.has(k));
}

/** Separa os appIds da Steam (inclusive os escondidos em slugs "steam-<id>") para a consulta. */
export function lookupTerms(games: GameRef[]): { slugs: string[]; appIds: number[] } {
  const slugs = new Set<string>();
  const appIds = new Set<number>();
  for (const g of games) {
    slugs.add(g.slug);
    if (g.steamAppId) appIds.add(g.steamAppId);
    const m = g.slug.match(/^steam-(\d{1,10})$/);
    if (m) appIds.add(Number(m[1]));
  }
  return { slugs: [...slugs], appIds: [...appIds] };
}
