"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { cleanAward, type AwardInput } from "@/lib/awards";

export type AwardResult = { ok: true } | { ok: false; message: string };

/** Quantos selos exclusivos um perfil pode ter. */
const MAX_BADGES = 12;

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

function refresh(username: string) {
  revalidatePath(`/u/${username}`);
  revalidatePath(`/u/${username}/selos`);
  revalidatePath("/", "layout"); // o título aparece no feed, nas listas e nos comentários
}

/** Dá (ou troca) o título do perfil. `input = null` tira o título. Só administradores. */
export async function setUserTitle(userId: string, input: Omit<AwardInput, "description"> | null): Promise<AwardResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Só a moderação pode premiar perfis." };
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
  if (!target) return { ok: false, message: "Perfil não encontrado." };

  if (!input) {
    await prisma.user.update({ where: { id: userId }, data: { title: null, titleIcon: null, titleStyle: null } });
    refresh(target.username);
    return { ok: true };
  }
  const parsed = cleanAward(input);
  if (!parsed.ok) return parsed;
  const { text, icon, style } = parsed.value;
  await prisma.user.update({ where: { id: userId }, data: { title: text, titleIcon: icon, titleStyle: style } });
  await notify(prisma, { userId, actorId: admin.id, type: "AWARD" });
  refresh(target.username);
  return { ok: true };
}

/** Dá um selo exclusivo ao perfil. Só administradores. */
export async function giveBadge(userId: string, input: AwardInput): Promise<AwardResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Só a moderação pode premiar perfis." };
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, _count: { select: { awards: true } } } });
  if (!target) return { ok: false, message: "Perfil não encontrado." };
  if (target._count.awards >= MAX_BADGES) return { ok: false, message: `Um perfil tem no máximo ${MAX_BADGES} selos exclusivos.` };

  const parsed = cleanAward(input);
  if (!parsed.ok) return parsed;
  const { text, icon, style, description } = parsed.value;
  await prisma.awardedBadge.create({ data: { userId, name: text, description, icon, style, awardedById: admin.id } });
  await notify(prisma, { userId, actorId: admin.id, type: "AWARD" });
  refresh(target.username);
  return { ok: true };
}

export async function revokeBadge(badgeId: string): Promise<AwardResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Só a moderação pode premiar perfis." };
  const badge = await prisma.awardedBadge.findUnique({ where: { id: badgeId }, select: { user: { select: { username: true } } } });
  if (!badge) return { ok: false, message: "Selo não encontrado." };
  await prisma.awardedBadge.delete({ where: { id: badgeId } });
  refresh(badge.user.username);
  return { ok: true };
}
