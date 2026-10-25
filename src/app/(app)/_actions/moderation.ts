"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { DmPolicy, ReportTarget } from "@/generated/prisma/enums";
import { removeImage } from "@/lib/uploads";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { rateLimit } from "@/lib/rate-limit";
import { parsePrefs, type NotificationPrefs } from "@/lib/notification-prefs";

/** Limite de denúncias por pessoa por dia (evita uso como arma). */
const REPORTS_PER_DAY = 20;


// -----------------------------------------------------------------------------
//  Bloqueio
// -----------------------------------------------------------------------------

/** Bloqueia: some dos dois lados (feed, perfil, comentários, mensagens) e desfaz os follows. */
export async function blockUser(targetId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || user.id === targetId) return { ok: false };
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { username: true } });
  if (!target) return { ok: false };

  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: targetId } },
      create: { blockerId: user.id, blockedId: targetId },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: { OR: [{ followerId: user.id, followingId: targetId }, { followerId: targetId, followingId: user.id }] },
    }),
  ]);
  revalidatePath(`/u/${target.username}`);
  revalidatePath("/feed");
  return { ok: true };
}

export async function unblockUser(targetId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await prisma.block.deleteMany({ where: { blockerId: user.id, blockedId: targetId } });
  revalidatePath("/settings/privacy");
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Denúncia
// -----------------------------------------------------------------------------

export async function reportContent(input: {
  targetType: ReportTarget;
  targetId: string;
  reason: string;
  details?: string;
}): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login para denunciar." };
  if (!(REPORT_REASONS as readonly string[]).includes(input.reason)) return { ok: false, message: "Escolha um motivo." };
  const limit = await rateLimit("report", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };

  const today = await prisma.report.count({ where: { reporterId: user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
  if (today >= REPORTS_PER_DAY) return { ok: false, message: "Você já fez muitas denúncias hoje. Tente amanhã." };

  const dup = await prisma.report.findFirst({
    where: { reporterId: user.id, targetType: input.targetType, targetId: input.targetId, status: "OPEN" },
    select: { id: true },
  });
  if (!dup) {
    await prisma.report.create({
      data: {
        reporterId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details?.trim().slice(0, 1000) || null,
      },
    });
  }
  return { ok: true, message: "Denúncia enviada. Obrigado por ajudar a manter o Poneglyph.gg legal." };
}

// -----------------------------------------------------------------------------
//  Privacidade
// -----------------------------------------------------------------------------

export async function updatePrivacy(input: { isPrivate: boolean; dmPolicy: DmPolicy }): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !["EVERYONE", "FOLLOWING", "NOBODY"].includes(input.dmPolicy)) return { ok: false };

  await prisma.user.update({ where: { id: user.id }, data: { isPrivate: input.isPrivate, dmPolicy: input.dmPolicy } });
  // Voltou a ser público: os pedidos pendentes viram seguidores
  if (!input.isPrivate) {
    await prisma.follow.updateMany({ where: { followingId: user.id, status: "PENDING" }, data: { status: "ACCEPTED" } });
    await prisma.notification.deleteMany({ where: { userId: user.id, type: "FOLLOW_REQUEST" } });
  }
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/settings/privacy");
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Push
// -----------------------------------------------------------------------------

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false };
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return { ok: true };
}

/** Salva o que avisar e por onde, por categoria. Valores inválidos viram o padrão. */
export async function updateNotificationPrefs(prefs: NotificationPrefs): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await prisma.user.update({ where: { id: user.id }, data: { notificationPrefs: parsePrefs(prefs) } });
  revalidatePath("/settings/privacy");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Moderação (só administradores)
// -----------------------------------------------------------------------------

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

/** Apaga o conteúdo denunciado (publicação, comentário, post de clube ou mensagem). */
async function removeTarget(type: ReportTarget, id: string) {
  if (type === "ACTIVITY") {
    const a = await prisma.activity.findUnique({ where: { id }, select: { imageUrl: true, images: true } });
    await prisma.activity.deleteMany({ where: { id } });
    if (a) await Promise.all([...new Set([a.imageUrl, ...a.images])].map((url) => removeImage(url)));
  } else if (type === "COMMENT") await prisma.comment.deleteMany({ where: { id } });
  else if (type === "CLUB_POST") {
    const p = await prisma.clubPost.findUnique({ where: { id }, select: { imageUrl: true } });
    await prisma.clubPost.deleteMany({ where: { id } });
    await removeImage(p?.imageUrl);
  } else if (type === "MESSAGE") await prisma.message.deleteMany({ where: { id } });
  else if (type === "LIST") await prisma.gameList.deleteMany({ where: { id } });
  else if (type === "LIST_COMMENT") await prisma.gameListComment.deleteMany({ where: { id } });
}

/** Autor do conteúdo denunciado (para suspender). */
async function authorOf(type: ReportTarget, id: string) {
  if (type === "USER") return id;
  if (type === "ACTIVITY") return (await prisma.activity.findUnique({ where: { id }, select: { userId: true } }))?.userId;
  if (type === "COMMENT") return (await prisma.comment.findUnique({ where: { id }, select: { userId: true } }))?.userId;
  if (type === "CLUB_POST") return (await prisma.clubPost.findUnique({ where: { id }, select: { userId: true } }))?.userId;
  if (type === "LIST") return (await prisma.gameList.findUnique({ where: { id }, select: { userId: true } }))?.userId;
  if (type === "LIST_COMMENT") return (await prisma.gameListComment.findUnique({ where: { id }, select: { userId: true } }))?.userId;
  return (await prisma.message.findUnique({ where: { id }, select: { senderId: true } }))?.senderId;
}

export async function moderateReport(reportId: string, action: "dismiss" | "remove" | "ban"): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false };
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return { ok: false };

  if (action === "ban") {
    const author = await authorOf(report.targetType, report.targetId);
    if (author && author !== admin.id) await prisma.user.update({ where: { id: author }, data: { bannedAt: new Date() } });
  }
  if (action === "remove" || action === "ban") await removeTarget(report.targetType, report.targetId);

  // Fecha todas as denúncias abertas sobre o mesmo alvo
  await prisma.report.updateMany({
    where: { targetType: report.targetType, targetId: report.targetId, status: "OPEN" },
    data: { status: action === "dismiss" ? "DISMISSED" : "RESOLVED", resolvedAt: new Date() },
  });
  revalidatePath("/moderacao");
  revalidatePath("/feed");
  return { ok: true };
}

export async function setBanned(userId: string, banned: boolean): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin || admin.id === userId) return { ok: false };
  await prisma.user.update({ where: { id: userId }, data: { bannedAt: banned ? new Date() : null } });
  revalidatePath("/moderacao");
  return { ok: true };
}
