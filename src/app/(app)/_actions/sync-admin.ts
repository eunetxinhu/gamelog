"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { enqueueSteamSync, runWorker } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";
import { fail, MSG, ok, type ActionResult } from "@/lib/action-result";

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

/** Roda a fila agora (worker depois da resposta). */
export async function runQueueNow(): Promise<ActionResult> {
  if (!(await requireAdmin())) return fail(MSG.notAllowed);
  after(() => runWorker({ budgetMs: 50_000 }).catch((err) => console.error("[sync] worker", err)));
  return ok();
}

/** Nova sincronização para a pessoa (sem esperar o intervalo do botão). */
export async function retryUserSync(userId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return fail(MSG.notAllowed);
  const res = await enqueueSteamSync(userId, "CRON");
  if (!res.ok) return fail(res.error.message);
  after(() => runWorker({ budgetMs: 50_000 }).catch((err) => console.error("[sync] worker", err)));
  revalidatePath("/moderacao/fila");
  return ok();
}

/** Tarefa esperando nova tentativa: tenta já. */
export async function retryTaskNow(taskId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return fail(MSG.notAllowed);
  await prisma.syncTask.updateMany({ where: { id: taskId, status: "QUEUED" }, data: { runAfter: new Date() } });
  after(() => runWorker({ budgetMs: 50_000 }).catch((err) => console.error("[sync] worker", err)));
  revalidatePath("/moderacao/fila");
  return ok();
}
