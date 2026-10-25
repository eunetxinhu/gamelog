// Preparação do texto de busca (sem banco: testável).

/** Mínimo de semelhança (0–1) para um resultado "parecido" entrar na lista. */
export const FUZZY_THRESHOLD = 0.35;

/** Remove espaços extras, o @ do começo e limita o tamanho. Vazio = não busca. */
export function normalizeQuery(raw: string | null | undefined, max = 80): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/^\s*@/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Escapa % _ e \ para usar dentro de um ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Compara títulos ignorando caixa, acentos e pontuação ("Pokémon: X" = "pokemon x"). */
export function sameTitle(a: string, b: string): boolean {
  return simplify(a) === simplify(b);
}

export function simplify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Sugestão "Você quis dizer…?": vale quando o melhor resultado parecido não contém
 * o que foi digitado (ou seja, a busca tinha erro de digitação).
 */
export function didYouMean(query: string, best: { title: string; score: number } | undefined): string | null {
  if (!best || best.score < FUZZY_THRESHOLD) return null;
  const q = simplify(query);
  const t = simplify(best.title);
  if (!q || t.includes(q)) return null;
  return best.title;
}
