// Estimativa de "tempo para zerar" (sem banco: testável).

/** Mínimo de jogadores que finalizaram para a mediana da comunidade valer. */
export const MIN_COMMUNITY_SAMPLE = 3;

export type CommunityTimes = {
  /** Mediana das horas na Steam de quem finalizou ou platinou (minutos) */
  finishMedian: number | null;
  finishCount: number;
  /** Mediana de quem platinou (minutos) */
  platinumMedian: number | null;
  platinumCount: number;
};

export type Estimate = { minutes: number; source: "community" | "rawg"; sample?: number };

/**
 * Prefere a comunidade do site (horas reais de quem finalizou, vindas da Steam);
 * sem amostra suficiente, usa a média de horas na Steam informada pela RAWG.
 */
export function pickEstimate(community: CommunityTimes | undefined, rawgHours: number | null | undefined): Estimate | null {
  if (community && community.finishMedian && community.finishCount >= MIN_COMMUNITY_SAMPLE) {
    return { minutes: Math.round(community.finishMedian), source: "community", sample: community.finishCount };
  }
  if (rawgHours && rawgHours > 0) return { minutes: rawgHours * 60, source: "rawg" };
  return null;
}

/** "~45 min", "~12 h", "~1.250 h" (arredonda: é estimativa). */
export function formatEstimate(minutes: number): string {
  if (minutes < 60) return `~${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  const hours = minutes / 60;
  const rounded = hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours);
  return `~${rounded.toLocaleString("pt-BR")} h`;
}

/** Soma do backlog: total estimado e quantos jogos têm estimativa. */
export function sumEstimates(estimates: (Estimate | null)[]): { minutes: number; covered: number; total: number } {
  const known = estimates.filter((e): e is Estimate => e !== null);
  return { minutes: known.reduce((acc, e) => acc + e.minutes, 0), covered: known.length, total: estimates.length };
}
