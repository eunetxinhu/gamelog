"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** Concluiu (ou pulou) o "Primeiros passos": o convite some do feed. */
export async function finishOnboarding(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (!user.onboardedAt) await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  revalidatePath("/feed");
  return { ok: true };
}
