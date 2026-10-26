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

const convUserSelect = { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } as const;

export type ConversationItem = {
  id: string;
  other: { id: string; username: string; displayName: string | null; avatarUrl: string | null; steamAvatarUrl: string | null };
  last: { body: string | null; imageUrl: string | null; senderId: string; createdAt: Date };
  unread: boolean;
};

/** Conversas mais recentes (com a última mensagem), sem quem está bloqueado. Página Mensagens e lateral do feed. */
export async function recentConversations(viewerId: string, hidden: string[], take = 50): Promise<ConversationItem[]> {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
    orderBy: { lastMessageAt: "desc" },
    // Pede um pouco a mais: conversas vazias ou bloqueadas saem depois
    take: take + hidden.length + 5,
    include: {
      userA: { select: convUserSelect },
      userB: { select: convUserSelect },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, imageUrl: true, senderId: true, createdAt: true } },
    },
  });
  return conversations
    .flatMap((c): ConversationItem[] => {
      const mine = c.userAId === viewerId;
      const other = mine ? c.userB : c.userA;
      const readAt = mine ? c.readAtA : c.readAtB;
      const last = c.messages[0];
      if (!last || hidden.includes(other.id)) return [];
      return [{ id: c.id, other, last, unread: last.senderId !== viewerId && (!readAt || last.createdAt > readAt) }];
    })
    .slice(0, take);
}
