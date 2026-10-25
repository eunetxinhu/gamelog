import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import { sendPush, type PushPayload } from "@/lib/push";
import { isBlockedEitherWay } from "@/lib/privacy";

type Db = Prisma.TransactionClient | typeof prisma;

type NotifyInput = { userId: string; actorId?: string | null; type: NotificationType; activityId?: string | null; gameId?: string | null };

/**
 * Cria uma notificação (e o push correspondente). Ignora quando a pessoa age sobre si
 * mesma, quando há bloqueio entre as duas e não repete a mesma notificação ainda não lida
 * (curtir/descurtir/curtir não gera três).
 */
export async function notify(db: Db, input: NotifyInput) {
  const actorId = input.actorId ?? null;
  if (actorId && input.userId === actorId) return;
  if (actorId && (await isBlockedEitherWay(input.userId, actorId))) return;

  const repeatable: NotificationType[] = ["COMMENT", "MESSAGE", "MENTION", "DEAL"];
  if (!repeatable.includes(input.type)) {
    const dup = await db.notification.findFirst({
      where: { userId: input.userId, actorId, type: input.type, activityId: input.activityId ?? null, readAt: null },
      select: { id: true },
    });
    if (dup) return;
  }
  const created = await db.notification.create({
    data: { userId: input.userId, actorId, type: input.type, activityId: input.activityId ?? null, gameId: input.gameId ?? null },
    select: { id: true },
  });
  schedulePush([created.id]);
}

/** Avisa todos os seguidores (aprovados) de `actorId` (usado nas platinas). */
export async function notifyFollowers(db: Db, actorId: string, type: NotificationType, activityId: string) {
  const followers = await db.follow.findMany({ where: { followingId: actorId, status: "ACCEPTED" }, select: { followerId: true } });
  if (followers.length === 0) return;
  const created = await db.notification.createManyAndReturn({
    data: followers.map((f) => ({ userId: f.followerId, actorId, type, activityId })),
    select: { id: true },
  });
  schedulePush(created.map((c) => c.id));
}

/** Cria notificações do sistema em lote (promoção, resumo semanal) e manda os pushes. */
export async function notifyMany(data: { userId: string; type: NotificationType; gameId?: string | null }[]) {
  if (data.length === 0) return;
  const created = await prisma.notification.createManyAndReturn({ data, select: { id: true } });
  schedulePush(created.map((c) => c.id));
}

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// -----------------------------------------------------------------------------
//  Texto do push
// -----------------------------------------------------------------------------

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Push depois da resposta (`after`): a notificação pode ter sido criada dentro de uma
 * transação ainda aberta (ex.: platina na sincronização), que só grava no fim.
 */
function schedulePush(ids: string[]) {
  if (ids.length) after(() => deliverPush(ids));
}

/** Monta o texto de cada notificação e manda para os aparelhos do destinatário. Nunca lança. */
async function deliverPush(ids: string[]) {
  if (ids.length === 0) return;
  try {
    const rows = await prisma.notification.findMany({
      where: { id: { in: ids } },
      include: {
        user: { select: { username: true } },
        actor: { select: { username: true, displayName: true } },
        activity: { select: { id: true, game: { select: { title: true } } } },
        game: { select: { slug: true, title: true, discountPercent: true, priceFinal: true } },
      },
    });
    await Promise.all(
      rows.map((n) => {
        const who = n.actor ? (n.actor.displayName ?? n.actor.username) : "GameLog";
        const game = n.activity?.game.title ?? n.game?.title ?? "";
        const post = n.activity ? `/p/${n.activity.id}` : n.actor ? `/u/${n.actor.username}` : "/notifications";
        const map: Record<NotificationType, PushPayload> = {
          LIKE: { title: `${who} curtiu sua publicação`, body: game, url: post },
          GG: { title: `${who} mandou GG 🏆`, body: game, url: post },
          COMMENT: { title: `${who} comentou`, body: game, url: `${post}#comentarios` },
          FOLLOW: { title: `${who} começou a seguir você`, body: "Veja o perfil", url: post },
          PLATINUM: { title: `${who} platinou ${game} 🏆`, body: "Mande um GG!", url: post },
          DEAL: {
            title: `${game} em promoção`,
            body: n.game?.discountPercent ? `-${n.game.discountPercent}%${n.game.priceFinal ? ` por ${brl.format(n.game.priceFinal / 100)}` : ""}` : "Está na sua wishlist",
            url: n.game ? `/games/${n.game.slug}` : "/notifications",
          },
          WEEKLY: { title: "Seu resumo da semana está pronto", body: "Veja o que você jogou, finalizou e platinou", url: `/u/${n.user.username}/semana` },
          MESSAGE: { title: `Mensagem de ${who}`, body: "Toque para responder", url: n.actor ? `/mensagens/${n.actor.username}` : "/mensagens" },
          MENTION: { title: `${who} mencionou você`, body: game, url: `${post}#comentarios` },
          FOLLOW_REQUEST: { title: `${who} pediu para seguir você`, body: "Aprove ou recuse nas notificações", url: "/notifications" },
          INVITE_JOINED: { title: `${who} entrou pelo seu convite 🎉`, body: "Diga oi!", url: post },
          RELEASE: {
            title: `${game} lançou hoje! 🎉`,
            body: "Estava na sua wishlist. Bora jogar?",
            url: n.game ? `/games/${n.game.slug}` : "/lancamentos",
          },
        };
        return sendPush([n.userId], { ...map[n.type], tag: n.type === "MESSAGE" ? `dm-${n.actorId}` : n.id });
      }),
    );
  } catch (err) {
    console.error("[push] entrega falhou", err);
  }
}
