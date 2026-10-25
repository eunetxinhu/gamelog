import "server-only";

/** Tamanho padrão dos cards de compartilhamento (Open Graph). */
export const OG_SIZE = { width: 1200, height: 630 };

const OG_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"];

/**
 * Primeira URL que responde com uma imagem que o gerador de cards consegue desenhar.
 * Uma imagem quebrada (capa vertical que o jogo não tem, link de avatar morto,
 * WebP) derrubaria o card inteiro, então tudo passa por aqui antes.
 */
export async function firstDrawable(urls: (string | null | undefined)[]): Promise<string | null> {
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } });
      const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (res.ok && OG_IMAGE_TYPES.includes(type)) return url;
    } catch {
      // tenta a próxima
    }
  }
  return null;
}

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
