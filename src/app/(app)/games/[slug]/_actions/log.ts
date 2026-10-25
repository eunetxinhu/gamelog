"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ACTIVITY_FOR_STATUS, recordActivity } from "@/lib/activity";
import type { LogStatus } from "@/generated/prisma/enums";

const STATUSES: LogStatus[] = ["PLAYING", "COMPLETED", "PLATINUM", "DROPPED", "BACKLOG"];

export type SaveLogInput = {
  gameId: string;
  status: LogStatus;
  rating: number | null;
  review: string;
  containsSpoiler: boolean;
};

export type SaveLogResult = { ok: true; posted: boolean } | { ok: false; message: string };

/**
 * Registra o jogo no perfil (status + nota + review) e compartilha no feed:
 *  - mudou de status (menos Backlog) → "começou a jogar" / "finalizou" / "platinou" / "dropou"
 *  - só mudou nota ou review → "avaliou"
 */
export async function saveGameLog(input: SaveLogInput): Promise<SaveLogResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login para registrar jogos." };

  if (!STATUSES.includes(input.status)) return { ok: false, message: "Status inválido." };
  const rating = input.rating === null ? null : Math.round(input.rating);
  if (rating !== null && (rating < 1 || rating > 5)) return { ok: false, message: "A nota vai de 1 a 5." };
  const review = input.review.trim().slice(0, 5000) || null;

  const game = await prisma.game.findUnique({ where: { id: input.gameId }, select: { id: true, slug: true } });
  if (!game) return { ok: false, message: "Jogo não encontrado." };

  const posted = await prisma.$transaction(async (tx) => {
    const before = await tx.gameLog.findUnique({ where: { userId_gameId: { userId: user.id, gameId: game.id } } });
    const today = new Date();
    const data = {
      status: input.status,
      rating,
      review,
      containsSpoiler: Boolean(review) && input.containsSpoiler,
      // Datas preenchidas na primeira vez que o status chega lá
      startedAt: before?.startedAt ?? (input.status === "PLAYING" ? today : null),
      finishedAt:
        before?.finishedAt ?? (input.status === "COMPLETED" || input.status === "PLATINUM" ? today : null),
    };
    await tx.gameLog.upsert({
      where: { userId_gameId: { userId: user.id, gameId: game.id } },
      create: { userId: user.id, gameId: game.id, ...data },
      update: data,
    });

    const statusChanged = before?.status !== input.status;
    const opinionChanged = before?.rating !== rating || (before?.review ?? null) !== review;
    const type = statusChanged ? ACTIVITY_FOR_STATUS[input.status] : opinionChanged && (rating || review) ? "REVIEW" : undefined;
    if (!type) return false;

    await recordActivity(tx, {
      userId: user.id,
      gameId: game.id,
      type,
      source: "MANUAL",
      rating,
      review,
      containsSpoiler: data.containsSpoiler,
    });
    return true;
  });

  revalidatePath(`/games/${game.slug}`);
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/feed");
  return { ok: true, posted };
}

/** Tira o jogo do perfil (as publicações já feitas continuam até serem apagadas). */
export async function removeGameLog(gameId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { slug: true } });
  await prisma.gameLog.deleteMany({ where: { userId: user.id, gameId } });
  if (game) revalidatePath(`/games/${game.slug}`);
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
}
