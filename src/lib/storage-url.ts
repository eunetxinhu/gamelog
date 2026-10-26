// Validação de URLs do nosso Storage e do conteúdo dos arquivos (sem rede: testável).

export const MEDIA_BUCKET = "profile-media";
const PUBLIC_PREFIX = `/storage/v1/object/public/${MEDIA_BUCKET}/`;

/**
 * Caminho dentro do bucket (`<userId>/arquivo.jpg`) se a URL for mesmo do nosso Storage;
 * senão `null`. Compara a origem exata (não aceita `projeto.supabase.co.outro-site.com`),
 * exige o prefixo do bucket e recusa `..`, barras invertidas e caracteres codificados
 * que mudem o caminho.
 */
export function storagePath(url: string | null | undefined, supabaseUrl: string | undefined): string | null {
  if (!url || !supabaseUrl) return null;
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (parsed.origin !== base.origin || parsed.username || parsed.password) return null;
  if (!parsed.pathname.startsWith(PUBLIC_PREFIX)) return null;
  const raw = parsed.pathname.slice(PUBLIC_PREFIX.length);
  // Exatamente o formato que nós geramos: <uuid da pessoa>/<nome com letras, números, - _ .>
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i.test(raw) || raw.includes("..")) return null;
  return raw;
}

/** O arquivo está na pasta desta pessoa? */
export function isOwnStoragePath(path: string | null, userId: string): path is string {
  return Boolean(path && path.startsWith(`${userId}/`));
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Tipo real da imagem pelos primeiros bytes (o tipo informado pelo navegador pode ser
 * qualquer coisa). `null` = não é JPEG, PNG nem WebP.
 */
export function sniffImageType(head: Uint8Array): ImageType | null {
  const b = head;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
