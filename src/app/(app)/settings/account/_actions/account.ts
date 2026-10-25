"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

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
