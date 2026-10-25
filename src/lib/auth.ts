import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

/**
 * Retorna o usuário autenticado (validado no servidor do Supabase com
 * getUser(), nunca getSession()) e o perfil correspondente em `users`.
 * Cria o perfil na primeira vez. `cache` deduplica dentro do mesmo request.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const authUser = data.user;
  const fallbackUsername =
    (authUser.user_metadata?.username as string | undefined) ??
    `player_${authUser.id.slice(0, 8)}`;

  return prisma.user.upsert({
    where: { id: authUser.id },
    update: {},
    create: {
      id: authUser.id,
      username: fallbackUsername,
      displayName: (authUser.user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (authUser.user_metadata?.avatar_url as string | undefined) ?? null,
    },
  });
});
