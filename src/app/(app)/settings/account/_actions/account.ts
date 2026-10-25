"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient, hasSupabaseAdmin } from "@/lib/supabase/admin";

export type ProfileInput = { displayName: string; bio: string; avatarUrl: string; bannerUrl: string };
export type AccountResult = { ok: true } | { ok: false; field?: keyof ProfileInput | "favorites"; message: string };

/** Vazio → null; senão precisa ser uma URL https (as imagens são exibidas para todo mundo). */
function imageUrl(raw: string): string | null | undefined {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 500 ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function updateProfile(input: ProfileInput): Promise<AccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };

  const displayName = input.displayName.trim().slice(0, 60) || null;
  const bio = input.bio.trim() || null;
  if (bio && bio.length > 280) return { ok: false, field: "bio", message: "A bio tem no máximo 280 caracteres." };

  const avatarUrl = imageUrl(input.avatarUrl);
  if (avatarUrl === undefined) return { ok: false, field: "avatarUrl", message: "Use um link de imagem começando com https://" };
  const bannerUrl = imageUrl(input.bannerUrl);
  if (bannerUrl === undefined) return { ok: false, field: "bannerUrl", message: "Use um link de imagem começando com https://" };

  await prisma.user.update({ where: { id: user.id }, data: { displayName, bio, avatarUrl, bannerUrl } });
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/", "layout"); // avatar na barra e nas publicações
  return { ok: true };
}

/** Top 4 do perfil: 4 posições, cada uma com um jogo ou vazia. */
export async function setFavorites(gameIds: (string | null)[]): Promise<AccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };

  const slots = gameIds.slice(0, 4).map((id, i) => ({ id, position: i + 1 })).filter((s): s is { id: string; position: number } => Boolean(s.id));
  if (new Set(slots.map((s) => s.id)).size !== slots.length) {
    return { ok: false, field: "favorites", message: "O mesmo jogo aparece duas vezes." };
  }
  const found = await prisma.game.count({ where: { id: { in: slots.map((s) => s.id) } } });
  if (found !== slots.length) return { ok: false, field: "favorites", message: "Algum jogo não foi encontrado." };

  await prisma.$transaction([
    prisma.favoriteGame.deleteMany({ where: { userId: user.id } }),
    prisma.favoriteGame.createMany({ data: slots.map((s) => ({ userId: user.id, gameId: s.id, position: s.position })) }),
  ]);
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Upload de foto e capa (Supabase Storage)
// -----------------------------------------------------------------------------

const BUCKET = "profile-media";
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

let bucketReady = false;

/** Cria o bucket público na primeira vez (precisa da chave secreta). */
async function ensureBucket(admin: ReturnType<typeof createSupabaseAdminClient>) {
  if (bucketReady) return;
  const { error } = await admin.storage.getBucket(BUCKET);
  if (error) {
    const created = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Object.keys(TYPES),
    });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  }
  bucketReady = true;
}

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/** Envia a foto ou a capa e já salva no perfil. `kind` vem no FormData. */
export async function uploadProfileImage(formData: FormData): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };
  if (!hasSupabaseAdmin()) return { ok: false, message: "Upload indisponível agora. Use um link de imagem." };

  const kind = formData.get("kind");
  const file = formData.get("file");
  if ((kind !== "avatar" && kind !== "banner") || !(file instanceof File)) return { ok: false, message: "Arquivo inválido." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, message: "Use uma imagem JPG, PNG ou WebP." };
  if (file.size > MAX_BYTES) return { ok: false, message: "A imagem passou de 4 MB." };

  const admin = createSupabaseAdminClient();
  await ensureBucket(admin);

  const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
  const up = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (up.error) {
    console.error("[upload]", up.error.message);
    return { ok: false, message: "Não foi possível enviar a imagem. Tente de novo." };
  }
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // Apaga a imagem anterior do mesmo tipo, se era nossa
  const previous = kind === "avatar" ? user.avatarUrl : user.bannerUrl;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  if (previous?.includes(marker)) {
    await admin.storage.from(BUCKET).remove([previous.split(marker)[1]]).catch(() => {});
  }

  await prisma.user.update({ where: { id: user.id }, data: kind === "avatar" ? { avatarUrl: url } : { bannerUrl: url } });
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/", "layout");
  return { ok: true, url };
}
