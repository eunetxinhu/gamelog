"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateGame, searchGames } from "@/lib/catalog";
import { isOwnImage, removeImage } from "@/lib/uploads";
import { notifyMentions } from "@/lib/mention-notify";
import { rateLimit } from "@/lib/rate-limit";
import { validatePhotoPost, type PhotoPostInput } from "@/lib/photo-post";

export type PhotoPostResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Publica fotos tiradas/escolhidas no aparelho, sempre associadas a um jogo.
 * As fotos já foram enviadas (uploadMedia, uma por vez) e chegam aqui como URLs do
 * nosso Storage na pasta da pessoa. Vira uma publicação "fotos" no feed, no perfil
 * e na página do jogo.
 */
export async function createPhotoPost(input: PhotoPostInput): Promise<PhotoPostResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login para publicar." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };

  const valid = validatePhotoPost(input, (url) => isOwnImage(url, user.id));
  if (!valid.ok) return valid;
  const { gameSlug, images, caption, containsSpoiler } = valid.value;

  const limit = await rateLimit("photo-post", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };

  // O jogo pode ainda não existir no banco (resultado da loja da Steam / RAWG): cria agora
  const game = await getOrCreateGame(gameSlug);
  if (!game) return { ok: false, message: "Não encontramos esse jogo. Escolha outro." };

  const created = await prisma.activity.create({
    data: {
      userId: user.id,
      gameId: game.id,
      type: "SCREENSHOT",
      source: "MANUAL",
      imageUrl: images[0],
      images,
      review: caption,
      containsSpoiler,
    },
    select: { id: true },
  });
  if (caption) await notifyMentions(user.id, caption, created.id);

  revalidatePath("/feed");
  revalidatePath(`/u/${user.username}`);
  revalidatePath(`/games/${game.slug}`);
  return { ok: true, id: created.id };
}

export type GameOption = { slug: string; title: string; coverUrl: string | null; steamAppId: number | null; year: number | null };

/** Busca de jogo do seletor do post (mesma busca da página Jogos, tolerante a erro de digitação). */
export async function searchGamesForPost(query: string): Promise<GameOption[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  if (!(await rateLimit("search", user.id)).ok) return [];
  const { results } = await searchGames(query);
  return results.slice(0, 8).map((r) => ({ slug: r.slug, title: r.title, coverUrl: r.coverUrl, steamAppId: r.steamAppId, year: r.year }));
}

/**
 * Apaga do Storage uma foto que a pessoa enviou e tirou do post antes de publicar.
 * Só apaga foto dela e que não está em uso em nenhum lugar.
 */
export async function discardUpload(url: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isOwnImage(url, user.id)) return;
  const [posts, messages, clubPosts, clubs, profile] = await Promise.all([
    prisma.activity.count({ where: { OR: [{ imageUrl: url }, { images: { has: url } }] } }),
    prisma.message.count({ where: { imageUrl: url } }),
    prisma.clubPost.count({ where: { imageUrl: url } }),
    prisma.club.count({ where: { imageUrl: url } }),
    prisma.user.count({ where: { OR: [{ avatarUrl: url }, { bannerUrl: url }] } }),
  ]);
  if (posts + messages + clubPosts + clubs + profile === 0) await removeImage(url);
}
