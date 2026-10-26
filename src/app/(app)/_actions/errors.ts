"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { clientIpHash, rateLimit } from "@/lib/rate-limit";
import { recordError } from "@/lib/error-log";

/** Erro que estourou no navegador (tela "Algo deu errado"). Com limite, para ninguém lotar o registro. */
export async function reportClientError(input: { message: string; stack?: string; path?: string; digest?: string }): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (!(await rateLimit("error-report", await clientIpHash())).ok) return;
  // Erro do servidor (tem digest) já foi registrado pelo onRequestError
  if (input.digest) return;
  await recordError({
    kind: "client",
    message: String(input.message ?? "").slice(0, 500),
    stack: String(input.stack ?? "").slice(0, 8000) || null,
    path: String(input.path ?? "").slice(0, 300) || null,
  });
}

export async function resolveError(id: string, resolved: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false };
  await prisma.errorEvent.update({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
  revalidatePath("/moderacao/erros");
  return { ok: true };
}
