// Escala de notas 0–100 (mesmas faixas da Metacritic), usada na Nota GameLog e no Metascore.
// Sem "server-only": também usada em Client Components.

export type ScoreTone = "great" | "good" | "mixed" | "bad";

export function scoreInfo(score: number): { label: string; tone: ScoreTone } {
  if (score >= 90) return { label: "Aclamação universal", tone: "great" };
  if (score >= 75) return { label: "Favorável", tone: "good" };
  if (score >= 50) return { label: "Misto", tone: "mixed" };
  return { label: "Desfavorável", tone: "bad" };
}

/** Média das estrelas (1–5) → nota 0–100. 1★ = 0, 5★ = 100. */
export function communityScore(avgStars: number) {
  return Math.round(((avgStars - 1) / 4) * 100);
}

/** Notas da comunidade só aparecem a partir disso (antes fica "a definir", como na Metacritic). */
export const MIN_RATINGS_FOR_SCORE = 2;

export const SCORE_BG: Record<ScoreTone, string> = {
  great: "bg-emerald-500 text-zinc-950",
  good: "bg-emerald-600 text-white",
  mixed: "bg-amber-400 text-zinc-950",
  bad: "bg-red-500 text-white",
};

export const SCORE_TEXT: Record<ScoreTone, string> = {
  great: "text-emerald-400",
  good: "text-emerald-400",
  mixed: "text-amber-300",
  bad: "text-red-400",
};
