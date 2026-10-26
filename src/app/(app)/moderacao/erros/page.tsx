import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Monitor, Server } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { ResolveButton } from "./resolve-button";

export const metadata: Metadata = { title: "Erros do site" };

/** Erros de produção agrupados (servidor e navegador). Só administradores. */
export default async function ErrorsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();

  const [open, resolved] = await Promise.all([
    prisma.errorEvent.findMany({ where: { resolvedAt: null }, orderBy: { lastSeenAt: "desc" }, take: 100 }),
    prisma.errorEvent.findMany({ where: { resolvedAt: { not: null } }, orderBy: { resolvedAt: "desc" }, take: 30 }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/moderacao" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> Moderação
      </Link>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-50">
        <AlertTriangle className="size-6 text-amber-400" aria-hidden /> Erros do site
      </h1>
      <p className="mb-6 text-sm text-zinc-400">
        Cada erro aparece uma vez, com quantas vezes aconteceu. Você recebe um push quando um erro novo aparece (no máximo 1 por hora para o mesmo erro).
      </p>

      {open.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-emerald-800/60 p-8 text-center text-sm text-emerald-300">Nenhum erro aberto. Mar calmo. 🌊</p>
      ) : (
        <ul className="space-y-3">{open.map((e) => <ErrorRow key={e.id} e={e} />)}</ul>
      )}

      {resolved.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-zinc-400">Resolvidos recentemente ({resolved.length})</summary>
          <ul className="mt-3 space-y-3 opacity-70">{resolved.map((e) => <ErrorRow key={e.id} e={e} />)}</ul>
        </details>
      )}
    </main>
  );
}

type Row = { id: string; kind: string; message: string; stack: string | null; path: string | null; method: string | null; count: number; firstSeenAt: Date; lastSeenAt: Date; resolvedAt: Date | null };

function ErrorRow({ e }: { e: Row }) {
  const Icon = e.kind === "client" ? Monitor : Server;
  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-4 shrink-0 ${e.kind === "client" ? "text-sky-300" : "text-brand-400"}`} aria-label={e.kind === "client" ? "Navegador" : "Servidor"} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-mono text-sm text-zinc-100">{e.message}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {e.method && `${e.method} `}
            {e.path ?? "rota desconhecida"} · <strong className="text-zinc-300">{e.count}×</strong> · última {relativeTime(e.lastSeenAt)} · primeira {relativeTime(e.firstSeenAt)}
          </p>
          {e.stack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-400">Detalhes</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/60 p-3 text-[11px] text-zinc-400">{e.stack}</pre>
            </details>
          )}
        </div>
        <ResolveButton id={e.id} resolved={Boolean(e.resolvedAt)} />
      </div>
    </li>
  );
}
