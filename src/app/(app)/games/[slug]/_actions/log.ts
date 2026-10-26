"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ACTIVITY_FOR_STATUS, recordActivity } from "@/lib/activity";
import { isOwnImage } from "@/lib/uploads";
import { notifyMentions } from "@/lib/mention-notify";
import { rateLimit } from "@/lib/rate-limit";
import type { LogStatus } from "@/generated/prisma/enums";
import { checkNewAccountText } from "@/lib/trust";
import { fail, MSG, ok, type ActionResult } from "@/lib/action-result";

const STATUSES: LogStatus[] = ["PLAYING", "COMPLETED", "PLATINUM", "DROPPED", "BACKLOG"];

export type SaveLogInput = {
  gameId: string;
  status: LogStatus;
  rating: number | null;
  review: string;
  containsSpoiler: boolean;
  /** Print anexado (URL do nosso Storage) */
  imageUrl?: string | null;
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
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };
  const limit = await rateLimit("game-log", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };
  const imageUrl = isOwnImage(input.imageUrl, user.id) ? input.imageUrl : null;

  if (!STATUSES.includes(input.status)) return { ok: false, message: "Status inválido." };
  const rating = input.rating === null ? null : Math.round(input.rating);
  if (rating !== null && (rating < 1 || rating > 5)) return { ok: false, message: "A nota vai de 1 a 5." };
  const review = input.review.trim().slice(0, 5000) || null;
  const blocked = checkNewAccountText(user, review);
  if (blocked) return { ok: false, message: blocked };

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
    // Só a foto (ou Backlog com foto): publica como print
    const finalType = type ?? (imageUrl ? "SCREENSHOT" : undefined);
    if (!finalType) return false;

    await recordActivity(tx, {
      userId: user.id,
      gameId: game.id,
      type: finalType,
      source: "MANUAL",
      rating,
      review,
      containsSpoiler: data.containsSpoiler,
      imageUrl,
    });
    return true;
  });

  // @menções na review
  if (posted && review) {
    const latest = await prisma.activity.findFirst({
      where: { userId: user.id, gameId: game.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest) await notifyMentions(user.id, review, latest.id);
  }

  revalidatePath(`/games/${game.slug}`);
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/feed");
  return { ok: true, posted };
}

/** Tira o jogo do perfil (as publicações já feitas continuam até serem apagadas). */
export async function removeGameLog(gameId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(MSG.login);
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { slug: true } });
  await prisma.gameLog.deleteMany({ where: { userId: user.id, gameId } });
  if (game) revalidatePath(`/games/${game.slug}`);
  revalidatePath(`/u/${user.username}`);
  return ok();
}

/**
 * "Quero jogar" num toque: coloca o jogo na fila (status Quero jogar, sem publicar no
 * feed) ou tira. Não mexe em jogo que já tem outro status (Jogando, Finalizado…) e não
 * apaga nota/review: nesses casos devolve uma mensagem para usar o registro abaixo.
 */
export async function setWantToPlay(gameId: string, want: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(MSG.login);
  if (user.bannedAt) return fail("Sua conta está suspensa.");
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { slug: true } });
  if (!game) return fail("Jogo não encontrado.");

  const key = { userId_gameId: { userId: user.id, gameId } };
  const log = await prisma.gameLog.findUnique({ where: key, select: { status: true, rating: true, review: true } });

  if (want) {
    if (log && log.status !== "BACKLOG") return fail("Esse jogo já está no seu perfil com outro status. Mude no registro abaixo.");
    if (!log) await prisma.gameLog.create({ data: { userId: user.id, gameId, status: "BACKLOG" } });
  } else if (log?.status === "BACKLOG") {
    if (log.rating !== null || log.review?.trim()) return fail("Esse registro tem nota ou review. Para tirar, use “Tirar do perfil” no registro abaixo.");
    await prisma.gameLog.delete({ where: key });
  }

  revalidatePath(`/games/${game.slug}`);
  revalidatePath(`/u/${user.username}`);
  return ok();
}
