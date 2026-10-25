"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { syncSteamForUser } from "@/lib/steam/sync";
import { isSteamOnlyEmail } from "@/lib/steam/signin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SteamSyncResult } from "./types";

/** Sincroniza a biblioteca Steam do usuário logado (botão e sincronização automática). */
export async function syncSteamLibrary(): Promise<SteamSyncResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Faça login para sincronizar sua Steam." } };
  return syncSteamForUser(user);
}

/** Desvincula a Steam e remove os jogos importados dela (logs/reviews ficam). */
export async function unlinkSteam(): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const { data } = await (await createSupabaseServerClient()).auth.getUser();
  if (isSteamOnlyEmail(data.user?.email)) {
    return { ok: false, message: "Sua conta foi criada com a Steam e ela é o seu login. Não dá para desvincular." };
  }

  await prisma.$transaction([
    prisma.libraryEntry.deleteMany({ where: { userId: user.id, source: { in: ["STEAM", "FAMILY"] } } }),
    prisma.user.update({
      where: { id: user.id },
      data: { steamId: null, steamPersonaName: null, steamAvatarUrl: null, steamLastSyncAt: null },
    }),
  ]);

  revalidatePath(`/u/${user.username}`);
  revalidatePath("/settings/profile");
  return { ok: true };
}
