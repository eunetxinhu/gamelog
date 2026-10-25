// Ordem da aba "Para você": engajamento recente com o tempo pesando contra
// (no estilo do Hacker News), sem deixar uma pessoa só tomar a aba inteira.

export type TrendInput = { reactions: number; comments: number; hasContent: boolean; ageHours: number };

/**
 * Curtidas/GGs valem 2, comentários 4; foto ou review dá um empurrão. Quanto mais velho,
 * menos pontos, mas devagar (expoente 0,8): numa comunidade pequena, uma publicação de
 * ontem que gerou conversa ainda deve passar na frente de uma nova sem interação.
 */
export function trendScore({ reactions, comments, hasContent, ageHours }: TrendInput): number {
  const points = 1 + 2 * reactions + 4 * comments + (hasContent ? 1 : 0);
  return points / Math.pow(Math.max(0, ageHours) + 2, 0.8);
}

/**
 * Ordena pela pontuação e limita quantas publicações de cada pessoa entram antes das
 * outras (as que passarem do limite vão para o fim, na mesma ordem).
 */
export function rankForYou<T extends { id: string; userId: string; score: number }>(items: T[], perAuthor = 2): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const count = new Map<string, number>();
  const head: T[] = [];
  const tail: T[] = [];
  for (const it of sorted) {
    const n = count.get(it.userId) ?? 0;
    (n < perAuthor ? head : tail).push(it);
    count.set(it.userId, n + 1);
  }
  return [...head, ...tail];
}
