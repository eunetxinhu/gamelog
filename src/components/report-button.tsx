"use client";

import { useState, useTransition } from "react";
import { Flag, Loader2, X } from "lucide-react";
import { reportContent } from "@/app/(app)/_actions/moderation";
import { REPORT_REASONS } from "@/lib/report-reasons";

type Target = "ACTIVITY" | "COMMENT" | "USER" | "CLUB_POST" | "MESSAGE" | "LIST" | "LIST_COMMENT";

/** Ícone/botão "Denunciar" que abre o formulário de denúncia. */
export function ReportButton({ targetType, targetId, label, className = "" }: { targetType: Target; targetId: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || "inline-flex items-center gap-1.5 rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-amber-300"}
        aria-label="Denunciar"
        title="Denunciar"
      >
        <Flag className="size-4" aria-hidden />
        {label}
      </button>
      {open && <ReportDialog targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({ targetType, targetId, onClose }: { targetType: Target; targetId: string; onClose: () => void }) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => setResult(await reportContent({ targetType, targetId, reason, details })));
  }

  return (
    // No celular abre como folha a partir de baixo; no computador, centralizado
    <div role="dialog" aria-modal="true" aria-label="Denunciar" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-50">Denunciar</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800" aria-label="Fechar">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {result?.ok ? (
          <p className="text-sm text-emerald-300">{result.message}</p>
        ) : (
          <>
            <fieldset className="space-y-1.5">
              <legend className="mb-2 text-sm text-zinc-400">Qual o problema?</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-sm text-zinc-200 hover:bg-zinc-900 sm:py-1.5">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-sky-500" />
                  {r}
                </label>
              ))}
            </fieldset>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Detalhes (opcional)"
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
            />
            {result && !result.ok && <p className="mt-2 text-sm text-red-300">{result.message}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800">
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!reason || pending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Enviar denúncia
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
