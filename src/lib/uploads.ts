import "server-only";
import { createSupabaseAdminClient, hasSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "profile-media";
const MAX_BYTES = 4 * 1024 * 1024;
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

/** Guarda a imagem em `<userId>/<kind>-<data>.<ext>` e devolve a URL pública. */
export async function uploadImage(userId: string, kind: UploadKind, file: unknown): Promise<UploadResult> {
  if (!hasSupabaseAdmin()) return { ok: false, message: "Upload indisponível agora." };
  if (!(file instanceof File)) return { ok: false, message: "Arquivo inválido." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, message: "Use uma imagem JPG, PNG ou WebP." };
  if (file.size > MAX_BYTES) return { ok: false, message: "A imagem passou de 4 MB." };

  const admin = createSupabaseAdminClient();
  await ensureBucket(admin);
  const path = `${userId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (up.error) {
    console.error("[upload]", up.error.message);
    return { ok: false, message: "Não foi possível enviar a imagem. Tente de novo." };
  }
  return { ok: true, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

/** Apaga uma imagem nossa (ignora URLs de fora, como avatares da Steam). */
export async function removeImage(url: string | null | undefined) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  if (!url?.includes(marker) || !hasSupabaseAdmin()) return;
  await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .remove([url.split(marker)[1]])
    .catch(() => {});
}

/** URL veio do nosso Storage? (não aceitamos link arbitrário em posts e mensagens) */
export function isOurImage(url: string | null | undefined): url is string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base && url?.startsWith(base) && url.includes(`/storage/v1/object/public/${BUCKET}/`));
}
