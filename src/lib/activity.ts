import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityType, LibrarySource, LogStatus } from "@/generated/prisma/enums";
import { notifyFollowers } from "@/lib/notifications";
import { visibleUsersWhere } from "@/lib/privacy";
import { titleOf, titleSelect, type UserTitleData } from "@/lib/awards";

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
  imageUrl?: string | null;
  meta?: Prisma.InputJsonValue;
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
    // Conquista rara: uma publicação por conquista (não por jogo)
    const apiName = type === "RARE_ACHIEVEMENT" ? (input.meta as { apiName?: string } | undefined)?.apiName : undefined;
    const exists = await tx.activity.findFirst({
      where: { userId, gameId, type, ...(apiName ? { meta: { path: ["apiName"], equals: apiName } } : {}) },
      select: { id: true },
    });
    if (exists) return null;
  } else {
    const recent = await tx.activity.findFirst({
      where: { userId, gameId, type, createdAt: { gte: new Date(Date.now() - MERGE_WINDOW_MS) } },
      select: { id: true },
    });
    if (recent) {
      await tx.activity.update({
        where: { id: recent.id },
        data: {
          rating: input.rating ?? null,
          review: input.review ?? null,
          containsSpoiler: input.containsSpoiler ?? false,
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl, images: input.imageUrl ? [input.imageUrl] : [] } : {}),
        },
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
      imageUrl: input.imageUrl ?? null,
      images: input.imageUrl ? [input.imageUrl] : [],
      meta: input.meta,
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
  imageUrl: string | null;
  /** Fotos da publicação (inclui `imageUrl`, que é a primeira) */
  images: string[];
  meta: { apiName?: string; name?: string; description?: string; icon?: string; percent?: number } | null;
  /** `title`: título especial (ex.: "Fundador & CEO"), quando houver */
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; title: UserTitleData };
  game: { slug: string; title: string; coverUrl: string | null; steamAppId: number | null; platinumRarity: number | null };
  likeCount: number;
  ggCount: number;
  commentCount: number;
  likedByMe: boolean;
  ggByMe: boolean;
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
  // Esconde perfis privados que eu não sigo, bloqueios (dos dois lados) e contas suspensas
  const visible = await visibleUsersWhere(opts.viewerId);
  const rows = await prisma.activity.findMany({
    where: { AND: [opts.where ?? {}, { user: visible }, opts.before ? { createdAt: { lt: opts.before } } : {}] },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? PAGE_SIZE,
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, ...titleSelect } },
      game: { select: { slug: true, title: true, coverUrl: true, steamAppId: true, platinumRarity: true } },
      _count: { select: { comments: true } },
      likes: { where: { userId: opts.viewerId ?? "00000000-0000-0000-0000-000000000000" }, select: { type: true } },
    },
  });

  // Curtidas e GGs por publicação (uma query para a página toda)
  const reactions = rows.length
    ? await prisma.activityLike.groupBy({ by: ["activityId", "type"], where: { activityId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    : [];
  const countOf = (id: string, type: "LIKE" | "GG") => reactions.find((x) => x.activityId === id && x.type === type)?._count._all ?? 0;

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    source: r.source,
    rating: r.rating,
    review: r.review,
    containsSpoiler: r.containsSpoiler,
    createdAt: r.createdAt,
    imageUrl: r.imageUrl,
    images: r.images.length ? r.images : r.imageUrl ? [r.imageUrl] : [],
    meta: (r.meta as FeedItem["meta"]) ?? null,
    user: {
      id: r.user.id,
      username: r.user.username,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl ?? r.user.steamAvatarUrl,
      title: titleOf(r.user),
    },
    game: r.game,
    likeCount: countOf(r.id, "LIKE"),
    ggCount: countOf(r.id, "GG"),
    commentCount: r._count.comments,
    likedByMe: r.likes.some((l) => l.type === "LIKE"),
    ggByMe: r.likes.some((l) => l.type === "GG"),
  }));
}
