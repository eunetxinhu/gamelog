import "server-only";
import { mediaPublicBase, r2Delete, r2Enabled, r2List, r2Put } from "@/lib/r2";
import { thumbOf, variantPaths } from "@/lib/image-urls";
import { isOwnStoragePath, sniffImageType, storagePath } from "@/lib/storage-url";

const MAX_BYTES = 4 * 1024 * 1024;
/** A miniatura (até 960 px, JPEG) fica bem abaixo disso */
const MAX_THUMB_BYTES = 600 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type UploadKind = "avatar" | "banner" | "post" | "club" | "dm";
export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/** Fotos ligadas? (R2 configurado) */
export const uploadsEnabled = r2Enabled;

const publicUrl = (key: string) => `${mediaPublicBase()}/${key}`;

/**
 * Guarda a imagem em `<userId>/<kind>-<data>.<ext>` e devolve a URL pública.
 * Com `thumb` (miniatura JPEG gerada no navegador), guarda o par `…-hd.jpg` + `…-sd.jpg`
 * (ver lib/image-urls.ts): listas carregam a leve, a tela cheia carrega a grande.
 */
export async function uploadImage(userId: string, kind: UploadKind, file: unknown, thumb?: unknown): Promise<UploadResult> {
  if (!r2Enabled()) return { ok: false, message: "Upload indisponível agora." };
  if (!(file instanceof File)) return { ok: false, message: "Arquivo inválido." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, message: "Use uma imagem JPG, PNG ou WebP." };
  if (file.size > MAX_BYTES) return { ok: false, message: "A imagem passou de 4 MB." };

  // O tipo informado pelo navegador pode ser falso: confere pelos primeiros bytes
  if ((await sniff(file)) !== file.type) return { ok: false, message: "Use uma imagem JPG, PNG ou WebP." };

  const withThumb = thumb instanceof File && file.type === "image/jpeg";
  if (withThumb && (thumb.type !== "image/jpeg" || thumb.size > MAX_THUMB_BYTES || (await sniff(thumb)) !== "image/jpeg")) {
    return { ok: false, message: "Miniatura inválida." };
  }

  const base = `${userId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    if (!withThumb) {
      const key = `${base}.${ext}`;
      await r2Put(key, await file.arrayBuffer(), file.type);
      return { ok: true, url: publicUrl(key) };
    }
    // Miniatura primeiro: se a grande falhar, apaga a miniatura (nunca fica par pela metade)
    const paths = variantPaths(base);
    await r2Put(paths.thumb, await thumb.arrayBuffer(), "image/jpeg");
    try {
      await r2Put(paths.full, await file.arrayBuffer(), file.type);
    } catch (err) {
      await r2Delete([paths.thumb]).catch(() => {});
      throw err;
    }
    return { ok: true, url: publicUrl(paths.full) };
  } catch (err) {
    return uploadFailed(err instanceof Error ? err.message : String(err));
  }
}

async function sniff(file: File) {
  return sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
}

function uploadFailed(detail: string): UploadResult {
  console.error("[upload]", detail);
  return { ok: false, message: "Não foi possível enviar a imagem. Tente de novo." };
}

/**
 * Apaga uma imagem nossa e a miniatura dela, **só se estiver na pasta de `ownerId`**
 * (dono do conteúdo que está saindo). Ignora URLs de fora, como avatares da Steam,
 * e nunca apaga arquivo de outra pessoa, mesmo que a URL dela tenha sido colada aqui.
 */
export async function removeImage(url: string | null | undefined, ownerId: string) {
  if (!url || !isOwnImage(url, ownerId) || !r2Enabled()) return;
  const base = mediaPublicBase();
  const paths = [...new Set([url, thumbOf(url)])].map((u) => storagePath(u, base)).filter((p): p is string => isOwnStoragePath(p, ownerId));
  await r2Delete(paths).catch((err) => console.error("[upload] remover", err));
}

/** URL veio do nosso Storage? (não aceitamos link arbitrário em posts e mensagens) */
export function isOurImage(url: string | null | undefined): url is string {
  return storagePath(url, mediaPublicBase()) !== null;
}

/**
 * Apaga todos os arquivos da pessoa (`<userId>/…`), menos os de `keep` (URLs públicas).
 * Usado na exclusão da conta.
 */
export async function removeUserFiles(userId: string, keep: string[] = []) {
  if (!r2Enabled()) return 0;
  const base = mediaPublicBase();
  const keepPaths = new Set(keep.map((u) => storagePath(u, base)).filter(Boolean));
  // Lista tudo primeiro e só depois apaga (apagar durante a paginação pula arquivos)
  const paths = (await r2List(`${userId}/`)).filter((p) => !keepPaths.has(p));
  await r2Delete(paths);
  return paths.length;
}

/** URL do nosso Storage **na pasta da própria pessoa** (ninguém posta foto enviada por outro). */
export function isOwnImage(url: string | null | undefined, userId: string): url is string {
  return isOwnStoragePath(storagePath(url, mediaPublicBase()), userId);
}
