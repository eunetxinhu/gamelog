import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { applyReferral, cleanRef, findInviter } from "@/lib/referral";
import { cookies } from "next/headers";
import { E2E_COOKIE, e2eAuthEnabled, e2eUserId } from "@/lib/e2e";

/**
 * Retorna o usuário autenticado (validado no servidor do Supabase com
 * getUser(), nunca getSession()) e o perfil correspondente em `users`.
 * Cria o perfil na primeira vez (e aplica o convite, se veio de um).
 * `cache` deduplica dentro do mesmo request.
 */
export const getCurrentUser = cache(async () => {
  // Testes de ponta a ponta: o usuário vem de um cookie (desligado em produção, ver src/lib/e2e.ts)
  if (e2eAuthEnabled()) {
    const id = e2eUserId((await cookies()).get(E2E_COOKIE)?.value);
    return id ? prisma.user.findUnique({ where: { id } }) : null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const authUser = data.user;
  const existing = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (existing) return existing;

  const meta = authUser.user_metadata ?? {};
  const inviter = await findInviter(cleanRef(meta.ref));
  try {
    const created = await prisma.user.create({
      data: {
        id: authUser.id,
        username: (meta.username as string | undefined) ?? `player_${authUser.id.slice(0, 8)}`,
        displayName: (meta.full_name as string | undefined) ?? null,
        avatarUrl: (meta.avatar_url as string | undefined) ?? null,
        invitedById: inviter?.id ?? null,
      },
    });
    if (inviter) await applyReferral(created.id, inviter);
    return created;
  } catch (err) {
    // Outro request do mesmo login criou o perfil junto
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.user.findUnique({ where: { id: authUser.id } });
    }
    throw err;
  }
});
