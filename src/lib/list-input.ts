// Validação das listas da comunidade (sem banco: testável e usada no editor também).

export const LIST_LIMITS = { title: 80, description: 1000, note: 280, items: 100 } as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

export type ListItemInput = { slug: string; note?: string | null };
export type ListInput = { title: string; description?: string | null; ranked?: boolean; items: ListItemInput[] };
export type CleanList = { title: string; description: string | null; ranked: boolean; items: { slug: string; note: string | null }[] };

/** Arruma espaços e confere os limites. Jogo repetido conta uma vez (fica a primeira posição). */
export function cleanListInput(raw: ListInput): { ok: true; value: CleanList } | { ok: false; message: string } {
  const title = String(raw?.title ?? "").replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, message: "Dê um nome para a lista." };
  if (title.length > LIST_LIMITS.title) return { ok: false, message: `O nome tem no máximo ${LIST_LIMITS.title} caracteres.` };

  const description = String(raw?.description ?? "").trim() || null;
  if (description && description.length > LIST_LIMITS.description) {
    return { ok: false, message: `A descrição tem no máximo ${LIST_LIMITS.description} caracteres.` };
  }

  const seen = new Set<string>();
  const items: CleanList["items"] = [];
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    const slug = String(it?.slug ?? "");
    if (!SLUG_RE.test(slug)) return { ok: false, message: "Algum jogo da lista é inválido." };
    if (seen.has(slug)) continue;
    seen.add(slug);
    const note = String(it?.note ?? "").trim() || null;
    if (note && note.length > LIST_LIMITS.note) return { ok: false, message: `Cada comentário de jogo tem no máximo ${LIST_LIMITS.note} caracteres.` };
    items.push({ slug, note });
  }
  if (items.length === 0) return { ok: false, message: "Adicione pelo menos um jogo." };
  if (items.length > LIST_LIMITS.items) return { ok: false, message: `Uma lista tem no máximo ${LIST_LIMITS.items} jogos.` };

  return { ok: true, value: { title, description, ranked: Boolean(raw?.ranked), items } };
}
