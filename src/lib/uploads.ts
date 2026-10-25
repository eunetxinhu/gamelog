import "server-only";
import { createSupabaseAdminClient, hasSupabaseAdmin } from "@/lib/supabase/admin";
import { thumbOf, variantPaths } from "@/lib/image-urls";

const BUCKET = "profile-media";
const MAX_BYTES = 4 * 1024 * 1024;
/** A miniatura (até 960 px, JPEG) fica bem abaixo disso */
const MAX_THUMB_BYTES = 600 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type UploadKind = "avatar" | "banner" | "post" | "club" | "dm";
export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

let bucketReady = false;

/** Cria o bucket público na primeira vez (precisa da chave secreta). */
async function ensureBucket(admin: ReturnType<typeof createSupabaseAdminClient>) {
  if (bucketReady) return;
  const { error } = await admin.storage.getBucket(BUCKET);
  if (error) {
    const created = await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(TYPES) });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  }
  bucketReady = true;
}

/**
 * Guarda a imagem em `<userId>/<kind>-<data>.<ext>` e devolve a URL pública.
 * Com `thumb` (miniatura JPEG gerada no navegador), guarda o par `…-hd.jpg` + `…-sd.jpg`
 * (ver lib/image-urls.ts): listas carregam a leve, a tela cheia carrega a grande.
 */
export async function uploadImage(userId: string, kind: UploadKind, file: unknown, thumb?: unknown): Promise<UploadResult> {
  if (!hasSupabaseAdmin()) return { ok: false, message: "Upload indisponível agora." };
  if (!(file instanceof File)) return { ok: false, message: "Arquivo inválido." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, message: "Use uma imagem JPG, PNG ou WebP." };
  if (file.size > MAX_BYTES) return { ok: false, message: "A imagem passou de 4 MB." };

  const withThumb = thumb instanceof File && file.type === "image/jpeg";
  if (withThumb && (thumb.type !== "image/jpeg" || thumb.size > MAX_THUMB_BYTES)) return { ok: false, message: "Miniatura inválida." };

  const admin = createSupabaseAdminClient();
  await ensureBucket(admin);
  const bucket = admin.storage.from(BUCKET);
  const base = `${userId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const opts = { contentType: file.type, cacheControl: "31536000" };

  if (!withThumb) {
    const path = `${base}.${ext}`;
    const up = await bucket.upload(path, file, opts);
    if (up.error) return uploadFailed(up.error.message);
    return { ok: true, url: bucket.getPublicUrl(path).data.publicUrl };
  }

  // Miniatura primeiro: se a grande falhar, apaga a miniatura (nunca fica par pela metade)
  const paths = variantPaths(base);
  const small = await bucket.upload(paths.thumb, thumb, opts);
  if (small.error) return uploadFailed(small.error.message);
  const big = await bucket.upload(paths.full, file, opts);
  if (big.error) {
    await bucket.remove([paths.thumb]).catch(() => {});
    return uploadFailed(big.error.message);
  }
  return { ok: true, url: bucket.getPublicUrl(paths.full).data.publicUrl };
}

function uploadFailed(detail: string): UploadResult {
  console.error("[upload]", detail);
  return { ok: false, message: "Não foi possível enviar a imagem. Tente de novo." };
}

/** Apaga uma imagem nossa e a miniatura dela (ignora URLs de fora, como avatares da Steam). */
export async function removeImage(url: string | null | undefined) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  if (!url?.includes(marker) || !hasSupabaseAdmin()) return;
  const paths = [...new Set([url, thumbOf(url)])].map((u) => u.split(marker)[1]);
  await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .remove(paths)
    .catch(() => {});
}

/** URL veio do nosso Storage? (não aceitamos link arbitrário em posts e mensagens) */
export function isOurImage(url: string | null | undefined): url is string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base && url?.startsWith(base) && url.includes(`/storage/v1/object/public/${BUCKET}/`));
}

/**
 * Apaga todos os arquivos da pessoa (`<userId>/…`), menos os de `keep` (URLs públicas).
 * Usado na exclusão da conta.
 */
export async function removeUserFiles(userId: string, keep: string[] = []) {
  if (!hasSupabaseAdmin()) return 0;
  const bucket = createSupabaseAdminClient().storage.from(BUCKET);
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const keepPaths = new Set(keep.filter((u) => u.includes(marker)).map((u) => u.split(marker)[1]));

  // Lista tudo primeiro (paginando) e só depois apaga: apagar durante a paginação pula arquivos
  const paths: string[] = [];
  for (let offset = 0; offset < 10_000; offset += 100) {
    const { data, error } = await bucket.list(userId, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const f of data ?? []) {
      const path = `${userId}/${f.name}`;
      if (!keepPaths.has(path)) paths.push(path);
    }
    if (!data || data.length < 100) break;
  }

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const res = await bucket.remove(paths.slice(i, i + 100));
    if (res.error) throw res.error;
    removed += Math.min(100, paths.length - i);
  }
  return removed;
}

/** URL do nosso Storage **na pasta da própria pessoa** (ninguém posta foto enviada por outro). */
export function isOwnImage(url: string | null | undefined, userId: string): url is string {
  return isOurImage(url) && url.includes(`/storage/v1/object/public/${BUCKET}/${userId}/`);
}
