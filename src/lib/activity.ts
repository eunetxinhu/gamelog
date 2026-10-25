import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityType, LibrarySource, LogStatus } from "@/generated/prisma/enums";
import { notifyFollowers } from "@/lib/notifications";

/** Status do GameLog que viram publicação (BACKLOG não aparece no feed). */
export const ACTIVITY_FOR_STATUS: Partial<Record<LogStatus, ActivityType>> = {
  PLAYING: "STARTED_GAME",
  COMPLETED: "COMPLETED",
  PLATINUM: "PLATINUM",
  DROPPED: "DROPPED",
};

/** Mudar de ideia (Jogando → Finalizado → Jogando) dentro desse prazo atualiza a publicação em vez de criar outra. */
const MERGE_WINDOW_MS = 24 * 60 * 60 * 1000;

type RecordInput = {
  userId: string;
  gameId: string;
  type: ActivityType;
  source: LibrarySource;
  rating?: number | null;
  review?: string | null;
  containsSpoiler?: boolean;
  createdAt?: Date;
};

/**
 * Registra uma publicação no feed.
 *  - STEAM: no máximo uma por (usuário, jogo, tipo) — a sincronização roda várias vezes.
 *  - MANUAL: se já houver uma igual nas últimas 24h, atualiza ela.
 * Platina nova avisa os seguidores. Devolve o id criado, ou `null` quando não criou nada novo.
 */
export async function recordActivity(tx: Prisma.TransactionClient, input: RecordInput): Promise<string | null> {
  const { userId, gameId, type, source } = input;

  if (source === "STEAM") {
    const exists = await tx.activity.findFirst({ where: { userId, gameId, type }, select: { id: true } });
    if (exists) return null;
  } else {
    const recent = await tx.activity.findFirst({
      where: { userId, gameId, type, createdAt: { gte: new Date(Date.now() - MERGE_WINDOW_MS) } },
      select: { id: true },
    });
    if (recent) {
      await tx.activity.update({
        where: { id: recent.id },
        data: { rating: input.rating ?? null, review: input.review ?? null, containsSpoiler: input.containsSpoiler ?? false },
      });
      return null;
    }
  }

  const created = await tx.activity.create({
    data: {
      userId,
      gameId,
      type,
      source,
      rating: input.rating ?? null,
      review: input.review ?? null,
      containsSpoiler: input.containsSpoiler ?? false,
      createdAt: input.createdAt,
    },
    select: { id: true },
  });
  if (type === "PLATINUM") await notifyFollowers(tx, userId, "PLATINUM", created.id);
  return created.id;
}

// -----------------------------------------------------------------------------
//  Leitura (feed, perfil, página do jogo)
// -----------------------------------------------------------------------------

export type FeedItem = {
  id: string;
  type: ActivityType;
  source: LibrarySource;
  rating: number | null;
  review: string | null;
  containsSpoiler: boolean;
  createdAt: Date;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  game: { slug: string; title: string; coverUrl: string | null; steamAppId: number | null };
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export const PAGE_SIZE = 30;

/**
 * @param where   filtro (ex.: { userId } no perfil, { gameId } no jogo, { userId: { in } } no "seguindo")
 * @param before  paginação: publicações anteriores a essa data
 */
export async function getActivities(opts: {
  where?: Prisma.ActivityWhereInput;
  viewerId: string | null;
  before?: Date;
  take?: number;
}): Promise<FeedItem[]> {
  const rows = await prisma.activity.findMany({
    where: { ...opts.where, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? PAGE_SIZE,
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } },
      game: { select: { slug: true, title: true, coverUrl: true, steamAppId: true } },
      _count: { select: { likes: true, comments: true } },
      likes: { where: { userId: opts.viewerId ?? "00000000-0000-0000-0000-000000000000" }, select: { userId: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    source: r.source,
    rating: r.rating,
    review: r.review,
    containsSpoiler: r.containsSpoiler,
    createdAt: r.createdAt,
    user: {
      id: r.user.id,
      username: r.user.username,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl ?? r.user.steamAvatarUrl,
    },
    game: r.game,
    likeCount: r._count.likes,
    commentCount: r._count.comments,
    likedByMe: r.likes.length > 0,
  }));
}
