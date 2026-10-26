// Gosto dos jogadores (sem banco: testável). Compatibilidade, recomendações e gêneros.

export const MIN_COMMON = 3;

/**
 * Compatibilidade de gosto (0–100) pelas notas em comum (1 a 5 estrelas).
 * Diferença 0 entre as notas = 100%, diferença 4 = 0%. Com poucos jogos em comum
 * a média puxa para 50% (não dá para afirmar muito com 1 ou 2 jogos).
 * Devolve null com menos de MIN_COMMON jogos avaliados pelos dois.
 */
export function compatibility(mine: Map<string, number>, theirs: Map<string, number>) {
  const common: { gameId: string; a: number; b: number }[] = [];
  for (const [gameId, a] of mine) {
    const b = theirs.get(gameId);
    if (b !== undefined) common.push({ gameId, a, b });
  }
  if (common.length < MIN_COMMON) return null;
  const raw = common.reduce((acc, c) => acc + (1 - Math.abs(c.a - c.b) / 4), 0) / common.length;
  // Encolhe em direção a 50% quando há poucos jogos (k = 5 jogos "de confiança")
  const k = 5;
  const shrunk = (raw * common.length + 0.5 * k) / (common.length + k);
  const loved = common.filter((c) => c.a >= 4 && c.b >= 4).map((c) => c.gameId);
  const split = common.filter((c) => Math.abs(c.a - c.b) >= 3).map((c) => c.gameId);
  return { score: Math.round(shrunk * 100), common: common.length, loved, split };
}

export function compatibilityLabel(score: number): string {
  if (score >= 85) return "Almas gêmeas";
  if (score >= 70) return "Muito parecidos";
  if (score >= 55) return "Bem parecidos";
  if (score >= 40) return "Gostos diferentes";
  return "Opostos";
}

/**
 * Recomendações por filtragem colaborativa simples: jogos que pessoas de gosto
 * parecido avaliaram bem (4+) e que eu ainda não registrei nem tenho.
 * Peso de cada voto = similaridade × (nota − 3).
 */
export function recommend(
  neighbors: { similarity: number; ratings: Map<string, number> }[],
  exclude: Set<string>,
  take = 12,
): { gameId: string; score: number; votes: number }[] {
  const acc = new Map<string, { score: number; votes: number }>();
  for (const n of neighbors) {
    if (n.similarity <= 0) continue;
    for (const [gameId, rating] of n.ratings) {
      if (exclude.has(gameId) || rating < 4) continue;
      const cur = acc.get(gameId) ?? { score: 0, votes: 0 };
      cur.score += n.similarity * (rating - 3);
      cur.votes += 1;
      acc.set(gameId, cur);
    }
  }
  return [...acc.entries()]
    .map(([gameId, v]) => ({ gameId, ...v }))
    .sort((a, b) => b.score - a.score || b.votes - a.votes || a.gameId.localeCompare(b.gameId))
    .slice(0, take);
}

/** Gêneros favoritos pelas horas jogadas (um jogo sem horas, mas registrado, conta como 1 h). */
export function topGenres(games: { genres: string[]; minutes: number }[], take = 5): { genre: string; share: number }[] {
  const hours = new Map<string, number>();
  let total = 0;
  for (const g of games) {
    if (g.genres.length === 0) continue;
    const h = Math.max(1, g.minutes / 60);
    total += h;
    for (const genre of g.genres) hours.set(genre, (hours.get(genre) ?? 0) + h / g.genres.length);
  }
  if (total === 0) return [];
  return [...hours.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, take)
    .map(([genre, h]) => ({ genre, share: h / total }));
}

/** Em quantos % dos jogadores (com notas suficientes) a média é MAIOR que a minha: "mais exigente que X%". */
export function stricterThan(myAverage: number, averages: number[]): number {
  if (averages.length === 0) return 0;
  return Math.round((averages.filter((a) => a > myAverage).length / averages.length) * 100);
}
