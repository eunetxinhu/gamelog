"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { answerFollowRequest } from "@/app/(app)/_actions/social";

type Request = { id: string; username: string; displayName: string | null; avatar: string | null };

/** Pedidos para seguir o perfil privado: aprovar ou recusar. */
export function FollowRequests({ requests }: { requests: Request[] }) {
  const [list, setList] = useState(requests);
  const [pending, startTransition] = useTransition();
  if (list.length === 0) return null;

  function answer(id: string, accept: boolean) {
    startTransition(async () => {
      if ((await answerFollowRequest(id, accept)).ok) setList((l) => l.filter((r) => r.id !== id));
    });
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
      <h2 className="mb-3 text-sm font-semibold text-amber-200">Pedidos para seguir ({list.length})</h2>
      <ul className="space-y-3">
        {list.map((r) => {
          const name = r.displayName ?? r.username;
          return (
            <li key={r.id} className="flex items-center gap-3">
              <Link href={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} src={r.avatar} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-100">{name}</span>
                  <span className="block truncate text-xs text-zinc-500">@{r.username}</span>
                </span>
              </Link>
              <button type="button" disabled={pending} onClick={() => answer(r.id, true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50">
                <Check className="size-4" aria-hidden /> Aprovar
              </button>
              <button type="button" disabled={pending} onClick={() => answer(r.id, false)} className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50" aria-label={`Recusar ${name}`}>
                <X className="size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
