"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueSteamSync, getJobView, latestJobId, needsWorker, runWorker, type SyncJobView } from "@/lib/jobs/queue";
import { isSteamOnlyEmail } from "@/lib/steam/signin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SteamSyncError } from "./types";

export type StartSyncResult = { ok: true; jobId: string } | { ok: false; error: SteamSyncError };

/**
 * Pede uma sincronização da Steam (botão ou automática ao abrir o site). Responde na
 * hora com o id do job; o trabalho roda em segundo plano, em etapas (ver lib/jobs/queue.ts),
 * e a tela acompanha com `getSteamSyncStatus`.
 */
export async function startSteamSync(trigger: "MANUAL" | "AUTO" = "MANUAL"): Promise<StartSyncResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Faça login para sincronizar sua Steam." } };
  const res = await enqueueSteamSync(user.id, trigger === "AUTO" ? "AUTO" : "MANUAL");
  if (!res.ok) return res;
  // Começa já, depois da resposta (o worker acorda outros para os lotes em paralelo)
  if (!res.reused) after(() => runWorker({ budgetMs: 50_000 }).catch((err) => console.error("[sync] worker", err)));
  return { ok: true, jobId: res.jobId };
}

/** Situação da sincronização (a tela consulta a cada ~1,5 s até terminar). */
export async function getSteamSyncStatus(jobId?: string): Promise<SyncJobView | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const id = jobId ?? (await latestJobId(user.id));
  if (!id) return null;
  const view = await getJobView(id, user.id);
  // Enquanto alguém acompanha, a fila não fica parada: tarefa pronta sem worker acorda um
  if (view && (view.status === "QUEUED" || view.status === "RUNNING") && (await needsWorker(id))) {
    after(() => runWorker({ budgetMs: 50_000 }).catch((err) => console.error("[sync] worker", err)));
  }
  return view;
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
