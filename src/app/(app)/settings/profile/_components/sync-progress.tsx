"use client";

import { Check, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { SyncJobView } from "@/lib/jobs/queue";

/** Etapas da sincronização em andamento (a fila trabalha em segundo plano). */
export function SyncProgress({ view }: { view: SyncJobView }) {
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <p className="font-medium text-zinc-100">{view.status === "QUEUED" ? "Na fila…" : "Sincronizando em segundo plano"}</p>
        <span className="tabular-nums text-zinc-400">{view.percent}%</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${Math.max(4, view.percent)}%` }} />
      </div>
      <ul className="space-y-1.5 text-sm">
        {view.steps.map((s) => (
          <li key={s.step} className="flex items-center gap-2">
            {s.state === "done" ? (
              <Check className="size-4 text-emerald-400" aria-hidden />
            ) : s.state === "running" ? (
              <Loader2 className="size-4 animate-spin text-brand-400" aria-hidden />
            ) : s.state === "failed" ? (
              <XCircle className="size-4 text-amber-400" aria-hidden />
            ) : s.state === "skipped" ? (
              <MinusCircle className="size-4 text-zinc-500" aria-hidden />
            ) : (
              <Circle className="size-4 text-zinc-600" aria-hidden />
            )}
            <span className={s.state === "waiting" ? "text-zinc-500" : "text-zinc-200"}>{s.label}</span>
            {s.total > 1 && (
              <span className="text-xs tabular-nums text-zinc-500">
                {s.done} de {s.total} lotes
              </span>
            )}
          </li>
        ))}
      </ul>
      {view.notice && <p className="mt-3 text-xs text-amber-300/90">{view.notice}</p>}
      <p className="mt-3 text-xs text-zinc-500">Pode sair da página: a sincronização continua e o perfil se atualiza sozinho.</p>
    </div>
  );
}
