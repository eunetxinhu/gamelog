// Regras do post de fotos no feed (sem banco: testável e usado no client).

export const MAX_PHOTOS = 4;
export const CAPTION_MAX = 1000;

/** Slugs que o catálogo sabe abrir ("steam-123", "rawg-456") ou que já existem no banco. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export type PhotoPostInput = { gameSlug: string; images: string[]; caption: string; containsSpoiler: boolean };
export type PhotoPostValue = { gameSlug: string; images: string[]; caption: string | null; containsSpoiler: boolean };

/**
 * Valida o post. Toda foto precisa estar associada a um jogo e ter sido enviada pela
 * própria pessoa (`isOwn` confere se a URL é do nosso Storage, na pasta dela).
 */
export function validatePhotoPost(
  input: PhotoPostInput,
  isOwn: (url: string) => boolean,
): { ok: true; value: PhotoPostValue } | { ok: false; message: string } {
  const gameSlug = String(input.gameSlug ?? "").trim().toLowerCase();
  if (!gameSlug) return { ok: false, message: "Escolha de qual jogo são as fotos." };
  if (!SLUG.test(gameSlug)) return { ok: false, message: "Jogo inválido." };

  const images = [...new Set((input.images ?? []).filter((u) => typeof u === "string" && u.length > 0))];
  if (images.length === 0) return { ok: false, message: "Escolha pelo menos uma foto." };
  if (images.length > MAX_PHOTOS) return { ok: false, message: `No máximo ${MAX_PHOTOS} fotos por publicação.` };
  if (!images.every(isOwn)) return { ok: false, message: "Alguma foto não foi enviada direito. Tente escolher de novo." };

  const caption = String(input.caption ?? "").trim().slice(0, CAPTION_MAX) || null;
  return { ok: true, value: { gameSlug, images, caption, containsSpoiler: Boolean(caption) && Boolean(input.containsSpoiler) } };
}

/** Verbo do card: "compartilhou uma foto de" / "compartilhou 3 fotos de". */
export function photoVerb(count: number): string {
  if (count <= 1) return "compartilhou uma foto de";
  return `compartilhou ${count} fotos de`;
}
