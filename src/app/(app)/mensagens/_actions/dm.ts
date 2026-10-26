"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canMessage, conversationPair } from "@/lib/dm";
import { sendPush } from "@/lib/push";
import { isOwnImage } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";
import { wantsPush } from "@/lib/notification-prefs";
import { checkNewAccountText, isNewAccount, NEW_ACCOUNT_NEW_DMS_PER_DAY } from "@/lib/trust";

const MAX_LENGTH = 2000;

export type SendResult = { ok: true } | { ok: false; message: string };

/** Manda uma mensagem (cria a conversa na primeira vez) e avisa por push. */
export async function sendMessage(username: string, rawBody: string, rawImage?: string | null): Promise<SendResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };

  const body = rawBody.trim().slice(0, MAX_LENGTH);
  const imageUrl = isOwnImage(rawImage, user.id) ? rawImage : null;
  if (!body && !imageUrl) return { ok: false, message: "Escreva alguma coisa." };
  const blocked = checkNewAccountText(user, body);
  if (blocked) return { ok: false, message: blocked };
  const limit = await rateLimit("message", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };

  const recipient = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, dmPolicy: true, bannedAt: true, notificationPrefs: true },
  });
  if (!recipient) return { ok: false, message: "Usuário não encontrado." };
  const allowed = await canMessage(user.id, recipient);
  if (!allowed.ok) return { ok: false, message: allowed.reason };

  const pair = conversationPair(user.id, recipient.id);
  // Conta nova: poucas conversas NOVAS por dia (responder quem já falou com ela não conta)
  if (isNewAccount(user) && !(await prisma.conversation.findUnique({ where: { userAId_userBId: pair }, select: { id: true } }))) {
    const firstContact = await rateLimit("dm-new-account", user.id);
    if (!firstContact.ok) return { ok: false, message: `Contas novas podem começar até ${NEW_ACCOUNT_NEW_DMS_PER_DAY} conversas por dia. ${firstContact.message}` };
  }
  const now = new Date();
  const conv = await prisma.conversation.upsert({
    where: { userAId_userBId: pair },
    create: { ...pair, lastMessageAt: now },
    update: { lastMessageAt: now },
    select: { id: true, userAId: true },
  });
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId: conv.id, senderId: user.id, body, imageUrl } }),
    // Quem manda já "leu" a conversa até agora
    prisma.conversation.update({ where: { id: conv.id }, data: conv.userAId === user.id ? { readAtA: now } : { readAtB: now } }),
  ]);

  const name = user.displayName ?? user.username;
  if (wantsPush(recipient.notificationPrefs, "MESSAGE")) after(() =>
    sendPush([recipient.id], {
      title: `Mensagem de ${name}`,
      body: body ? body.slice(0, 120) : "📷 Foto",
      url: `/mensagens/${user.username}`,
      tag: `dm-${user.id}`, // várias mensagens da mesma pessoa viram uma notificação só
    }),
  );

  revalidatePath(`/mensagens/${username.toLowerCase()}`);
  revalidatePath("/mensagens");
  return { ok: true };
}

/** Marca a conversa como lida por mim. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { userAId: true, userBId: true } });
  if (!conv || (conv.userAId !== user.id && conv.userBId !== user.id)) return;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: conv.userAId === user.id ? { readAtA: new Date() } : { readAtB: new Date() },
  });
}

/** Apaga uma mensagem minha. */
export async function deleteMessage(messageId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const { count } = await prisma.message.deleteMany({ where: { id: messageId, senderId: user.id } });
  return { ok: count > 0 };
}
