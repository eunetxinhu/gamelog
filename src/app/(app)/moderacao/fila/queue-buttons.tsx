"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RotateCcw, Zap } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { retryTaskNow, retryUserSync, runQueueNow } from "../../_actions/sync-admin";

type Action = () => Promise<{ ok: boolean; message?: string }>;

function useRun() {
  const router = useRouter();
  const ask = useConfirm();
  const [pending, start] = useTransition();
  const run = (fn: Action) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) await ask({ title: "Não deu certo", description: res.message, notice: true });
      router.refresh();
    });
  return { pending, run };
}

const btn = "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50";

export function RunQueueButton() {
  const { pending, run } = useRun();
  return (
    <button type="button" disabled={pending} onClick={() => run(runQueueNow)} className={btn}>
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />} Rodar a fila agora
    </button>
  );
}

export function RetryUserButton({ userId }: { userId: string }) {
  const { pending, run } = useRun();
  return (
    <button type="button" disabled={pending} onClick={() => run(() => retryUserSync(userId))} className={btn}>
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />} Sincronizar de novo
    </button>
  );
}

export function RetryTaskButton({ taskId }: { taskId: string }) {
  const { pending, run } = useRun();
  return (
    <button type="button" disabled={pending} onClick={() => run(() => retryTaskNow(taskId))} className={btn}>
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />} Tentar já
    </button>
  );
}

/** Atualiza a página sozinha enquanto tem coisa andando na fila. */
export function AutoRefresh({ seconds, active }: { seconds: number; active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}
