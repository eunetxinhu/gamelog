"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateGame } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications";
import { visibleUsersWhere } from "@/lib/privacy";
import { cleanListInput, LIST_LIMITS, type ListInput } from "@/lib/list-input";
import { checkNewAccountText } from "@/lib/trust";

export type ListResult = { ok: true; id: string } | { ok: false; message: string };

/** Quantas listas uma pessoa pode ter. */
const MAX_LISTS_PER_USER = 200;
/** Jogos ainda fora do banco que uma gravação cadastra (cada um consulta a loja). */
const MAX_NEW_GAMES_PER_SAVE = 25;

/** Converte os slugs em ids, cadastrando os jogos da loja que ainda não estão no banco. */
async function resolveGames(slugs: string[]): Promise<Map<string, string> | string> {
  const known = await prisma.game.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const ids = new Map(known.map((g) => [g.slug, g.id]));
  const missing = slugs.filter((s) => !ids.has(s));
  if (missing.length > MAX_NEW_GAMES_PER_SAVE) return "Muitos jogos novos de uma vez. Salve a lista e adicione o resto depois.";
  for (const slug of missing) {
    const game = await getOrCreateGame(slug);
    if (!game) return "Não encontramos um dos jogos. Tire ele da lista e tente de novo.";
    ids.set(slug, game.id);
  }
  return ids;
}

/** Cria (sem `id`) ou atualiza uma lista. A ordem dos jogos é a ordem recebida. */
export async function saveList(input: ListInput & { id?: string }): Promise<ListResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };

  const parsed = cleanListInput(input);
  if (!parsed.ok) return parsed;
  const { title, description, ranked, items } = parsed.value;
  const blocked = checkNewAccountText(user, title, description, ...items.map((i) => i.note));
  if (blocked) return { ok: false, message: blocked };

  if (input.id) {
    const owner = await prisma.gameList.findUnique({ where: { id: input.id }, select: { userId: true } });
    if (!owner || owner.userId !== user.id) return { ok: false, message: "Essa lista não é sua." };
  } else if ((await prisma.gameList.count({ where: { userId: user.id } })) >= MAX_LISTS_PER_USER) {
    return { ok: false, message: `Você chegou ao limite de ${MAX_LISTS_PER_USER} listas.` };
  }

  const limit = await rateLimit("list-write", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };

  const ids = await resolveGames(items.map((i) => i.slug));
  if (typeof ids === "string") return { ok: false, message: ids };

  const rows = items.map((i, idx) => ({ gameId: ids.get(i.slug)!, position: idx + 1, note: i.note }));
  const id = await prisma.$transaction(async (tx) => {
    const list = input.id
      ? await tx.gameList.update({ where: { id: input.id }, data: { title, description, ranked }, select: { id: true } })
      : await tx.gameList.create({ data: { userId: user.id, title, description, ranked }, select: { id: true } });
    await tx.gameListItem.deleteMany({ where: { listId: list.id } });
    await tx.gameListItem.createMany({ data: rows.map((r) => ({ ...r, listId: list.id })) });
    return list.id;
  });

  revalidatePath("/listas");
  revalidatePath(`/listas/${id}`);
  revalidatePath(`/u/${user.username}`);
  return { ok: true, id };
}

export async function deleteList(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const list = await prisma.gameList.findUnique({ where: { id }, select: { userId: true } });
  if (!list || (list.userId !== user.id && !user.isAdmin)) return { ok: false };
  await prisma.gameList.delete({ where: { id } });
  revalidatePath("/listas");
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
}

/** Coloca um jogo no fim de uma das minhas listas (botão "Adicionar a uma lista" da página do jogo). */
export async function addGameToList(listId: string, gameSlug: string): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user || user.bannedAt) return { ok: false, message: "Faça login de novo." };
  const list = await prisma.gameList.findUnique({ where: { id: listId }, select: { userId: true, _count: { select: { items: true } } } });
  if (!list || list.userId !== user.id) return { ok: false, message: "Essa lista não é sua." };
  if (list._count.items >= LIST_LIMITS.items) return { ok: false, message: `A lista já tem ${LIST_LIMITS.items} jogos.` };
  if (!(await rateLimit("list-write", user.id)).ok) return { ok: false, message: "Muitas alterações seguidas. Tente daqui a pouco." };

  const game = await getOrCreateGame(gameSlug);
  if (!game) return { ok: false, message: "Jogo não encontrado." };
  const last = await prisma.gameListItem.aggregate({ where: { listId }, _max: { position: true } });
  await prisma.gameListItem.upsert({
    where: { listId_gameId: { listId, gameId: game.id } },
    create: { listId, gameId: game.id, position: (last._max.position ?? 0) + 1 },
    update: {},
  });
  await prisma.gameList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
  revalidatePath(`/listas/${listId}`);
  return { ok: true };
}

/** A lista existe e o visitante pode vê-la? Devolve o dono. */
async function visibleList(listId: string, viewerId: string) {
  return prisma.gameList.findFirst({ where: { id: listId, user: await visibleUsersWhere(viewerId) }, select: { userId: true } });
}

export async function toggleListLike(listId: string): Promise<{ ok: boolean; liked?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const list = await visibleList(listId, user.id);
  if (!list) return { ok: false };
  if (!(await rateLimit("reaction", user.id)).ok) return { ok: false };

  const key = { listId_userId: { listId, userId: user.id } };
  const existing = await prisma.gameListLike.findUnique({ where: key });
  if (existing) await prisma.gameListLike.delete({ where: key });
  else {
    await prisma.gameListLike.create({ data: { listId, userId: user.id } });
    await notify(prisma, { userId: list.userId, actorId: user.id, type: "LIST_LIKE", listId });
  }
  revalidatePath(`/listas/${listId}`);
  return { ok: true, liked: !existing };
}

export async function addListComment(listId: string, body: string): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login para comentar." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, message: "Escreva alguma coisa." };
  if (text.length > 1000) return { ok: false, message: "O comentário tem no máximo 1000 caracteres." };
  const blocked = checkNewAccountText(user, text);
  if (blocked) return { ok: false, message: blocked };

  const list = await visibleList(listId, user.id);
  if (!list) return { ok: false, message: "Lista não encontrada." };
  const limit = await rateLimit("comment", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };

  await prisma.gameListComment.create({ data: { listId, userId: user.id, body: text } });
  await notify(prisma, { userId: list.userId, actorId: user.id, type: "LIST_COMMENT", listId });
  revalidatePath(`/listas/${listId}`);
  return { ok: true };
}

/** Apaga quem escreveu, o dono da lista ou a moderação. */
export async function deleteListComment(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const c = await prisma.gameListComment.findUnique({ where: { id }, select: { userId: true, listId: true, list: { select: { userId: true } } } });
  if (!c || (c.userId !== user.id && c.list.userId !== user.id && !user.isAdmin)) return { ok: false };
  await prisma.gameListComment.delete({ where: { id } });
  revalidatePath(`/listas/${c.listId}`);
  return { ok: true };
}
