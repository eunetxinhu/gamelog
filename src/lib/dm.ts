import "server-only";
import { prisma } from "@/lib/prisma";
import { isBlockedEitherWay } from "@/lib/privacy";

/** Par em ordem fixa: uma conversa por dupla (userAId < userBId). */
export function conversationPair(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

type Recipient = { id: string; dmPolicy: "EVERYONE" | "FOLLOWING" | "NOBODY"; bannedAt: Date | null };

/**
 * Pode mandar mensagem? Respeita a escolha de quem recebe (todos / quem eu sigo / ninguém),
 * bloqueios e suspensão. Quem já recebeu mensagem da outra pessoa sempre pode responder.
 */
export async function canMessage(senderId: string, recipient: Recipient): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (senderId === recipient.id) return { ok: false, reason: "Você não pode mandar mensagem para si mesmo." };
  if (recipient.bannedAt) return { ok: false, reason: "Esta conta está suspensa." };
  if (await isBlockedEitherWay(senderId, recipient.id)) return { ok: false, reason: "Não é possível conversar com este perfil." };

  const conv = await prisma.conversation.findUnique({
    where: { userAId_userBId: conversationPair(senderId, recipient.id) },
    select: { id: true },
  });
  if (conv && (await prisma.message.count({ where: { conversationId: conv.id, senderId: recipient.id } })) > 0) return { ok: true };

  if (recipient.dmPolicy === "EVERYONE") return { ok: true };
  if (recipient.dmPolicy === "NOBODY") return { ok: false, reason: "Este perfil não recebe mensagens." };
  const follows = await prisma.follow.count({ where: { followerId: recipient.id, followingId: senderId, status: "ACCEPTED" } });
  return follows ? { ok: true } : { ok: false, reason: "Este perfil só recebe mensagens de quem ele segue." };
}

/** Mensagens não lidas (de outras pessoas, depois da última leitura de cada conversa). */
export async function unreadMessages(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.sender_id <> ${userId}::uuid
      AND (
        (c.user_a_id = ${userId}::uuid AND (c.read_at_a IS NULL OR m.created_at > c.read_at_a)) OR
        (c.user_b_id = ${userId}::uuid AND (c.read_at_b IS NULL OR m.created_at > c.read_at_b))
      )`;
  return Number(rows[0]?.n ?? 0);
}
