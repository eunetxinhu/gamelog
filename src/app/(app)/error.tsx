"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, Skull } from "lucide-react";
import { reportClientError } from "./_actions/errors";

/** Tela quando algo quebra dentro do site: avisa a moderação e deixa tentar de novo. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({ message: error.message, stack: error.stack, path: window.location.pathname, digest: error.digest }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto grid min-h-[60dvh] max-w-md place-items-center px-4 py-10 text-center">
      <div>
        <div className="mx-auto grid size-20 place-items-center rounded-full border border-brand-500/40 bg-black/50">
          <Skull className="size-10 text-brand-400" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-zinc-50">O navio bateu numa pedra</h1>
        <p className="mt-2 text-sm text-zinc-300">Algo deu errado nesta página. A moderação já foi avisada.</p>
        {error.digest && <p className="mt-1 font-mono text-xs text-zinc-600">código {error.digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500">
            <RotateCcw className="size-4" aria-hidden /> Tentar de novo
          </button>
          <Link href="/feed" className="rounded-lg border border-zinc-700 bg-black/40 px-5 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800">
            Voltar ao feed
          </Link>
        </div>
      </div>
    </main>
  );
}
