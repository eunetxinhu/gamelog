"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ListPlus, Loader2, Plus } from "lucide-react";
import { addGameToList } from "@/app/(app)/listas/_actions/lists";

type MyList = { id: string; title: string; hasGame: boolean };

/** "Adicionar a uma lista": escolhe uma das minhas listas ou cria uma nova já com o jogo. */
export function AddToList({ slug, lists, loggedIn }: { slug: string; lists: MyList[]; loggedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(() => new Set(lists.filter((l) => l.hasGame).map((l) => l.id)));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function add(id: string) {
    setBusy(id);
    setMessage(null);
    startTransition(async () => {
      const res = await addGameToList(id, slug);
      setBusy(null);
      if (res.ok) setAdded((s) => new Set(s).add(id));
      else setMessage(res.message ?? "Não deu para adicionar.");
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (loggedIn ? setOpen((o) => !o) : router.push(`/login?next=/games/${slug}`))}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
      >
        <ListPlus className="size-4" aria-hidden /> Adicionar a uma lista
      </button>
      {open && (
        // No celular vira uma folha fixa na parte de baixo (não estoura a largura da tela)
        <div className="fixed inset-x-4 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-40 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-11 sm:w-72">
          {lists.length > 0 && (
            <ul className="max-h-64 overflow-y-auto p-1">
              {lists.map((l) => {
                const has = added.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => add(l.id)}
                      disabled={has || busy !== null}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                      {busy === l.id ? (
                        <Loader2 className="size-4 animate-spin text-zinc-400" aria-hidden />
                      ) : has ? (
                        <Check className="size-4 text-emerald-400" aria-label="Já está na lista" />
                      ) : (
                        <Plus className="size-4 text-brand-400" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href={`/listas/nova?jogo=${slug}`} className="flex items-center gap-2 border-t border-zinc-800 px-4 py-2.5 text-sm font-medium text-brand-400 hover:bg-zinc-800">
            <Plus className="size-4" aria-hidden /> Nova lista com este jogo
          </Link>
          {message && (
            <p role="alert" className="border-t border-zinc-800 px-4 py-2 text-xs text-red-300">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
