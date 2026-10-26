"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { removeImage, uploadImage, type UploadResult } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";
import { getOrCreateGame } from "@/lib/catalog";
import { checkNewAccountText } from "@/lib/trust";

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
  const blocked = checkNewAccountText(user, bio, displayName);
  if (blocked) return { ok: false, field: "bio", message: blocked };

  const avatarUrl = imageUrl(input.avatarUrl);
  if (avatarUrl === undefined) return { ok: false, field: "avatarUrl", message: "Use um link de imagem começando com https://" };
  const bannerUrl = imageUrl(input.bannerUrl);
  if (bannerUrl === undefined) return { ok: false, field: "bannerUrl", message: "Use um link de imagem começando com https://" };

  await prisma.user.update({ where: { id: user.id }, data: { displayName, bio, avatarUrl, bannerUrl } });
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/", "layout"); // avatar na barra e nas publicações
  return { ok: true };
}

/** Top 4 do perfil: 4 posições, cada uma com um jogo (slug) ou vazia. Pode ser qualquer jogo do catálogo. */
export async function setFavorites(slugs: (string | null)[]): Promise<AccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };

  const slots = slugs
    .slice(0, 4)
    .map((slug, i) => ({ slug, position: i + 1 }))
    .filter((s): s is { slug: string; position: number } => typeof s.slug === "string" && /^[a-z0-9][a-z0-9-]{0,120}$/.test(s.slug));
  if (new Set(slots.map((s) => s.slug)).size !== slots.length) {
    return { ok: false, field: "favorites", message: "O mesmo jogo aparece duas vezes." };
  }
  // Jogos escolhidos pela busca podem ainda não estar no banco: cadastra (no máximo 4)
  const ids: string[] = [];
  for (const s of slots) {
    const game = (await prisma.game.findUnique({ where: { slug: s.slug }, select: { id: true } })) ?? (await getOrCreateGame(s.slug));
    if (!game) return { ok: false, field: "favorites", message: "Algum jogo não foi encontrado." };
    ids.push(game.id);
  }
  if (new Set(ids).size !== ids.length) return { ok: false, field: "favorites", message: "O mesmo jogo aparece duas vezes." };

  await prisma.$transaction([
    prisma.favoriteGame.deleteMany({ where: { userId: user.id } }),
    prisma.favoriteGame.createMany({ data: slots.map((s, i) => ({ userId: user.id, gameId: ids[i], position: s.position })) }),
  ]);
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Upload de foto e capa (Supabase Storage, ver lib/uploads.ts)
// -----------------------------------------------------------------------------

/** Envia a foto ou a capa e já salva no perfil. `kind` vem no FormData. */
export async function uploadProfileImage(formData: FormData): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };

  const kind = formData.get("kind");
  if (kind !== "avatar" && kind !== "banner") return { ok: false, message: "Arquivo inválido." };
  const limit = await rateLimit("upload", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };
  const res = await uploadImage(user.id, kind, formData.get("file"));
  if (!res.ok) return res;

  await removeImage(kind === "avatar" ? user.avatarUrl : user.bannerUrl, user.id);
  await prisma.user.update({ where: { id: user.id }, data: kind === "avatar" ? { avatarUrl: res.url } : { bannerUrl: res.url } });
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/", "layout");
  return res;
}
