import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { E2E_COOKIE, e2eAuthEnabled, e2eUserId } from "@/lib/e2e";
import { sessionUserId } from "@/lib/session";

/**
 * Retorna o perfil de quem está logado (ou null). A sessão é nossa (src/lib/session.ts):
 * token aleatório num cookie httpOnly, conferido pelo hash no banco.
 * `cache` deduplica dentro do mesmo request.
 */
export const getCurrentUser = cache(async () => {
  // Testes de ponta a ponta: o usuário vem de um cookie (desligado em produção, ver src/lib/e2e.ts)
  // (sem o cookie de teste, cai no login de verdade, que os testes também cobrem)
  if (e2eAuthEnabled()) {
    const id = e2eUserId((await cookies()).get(E2E_COOKIE)?.value);
    if (id) return prisma.user.findUnique({ where: { id } });
  }
  const userId = await sessionUserId();
  return userId ? prisma.user.findUnique({ where: { id: userId } }) : null;
});
