"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { setWantToPlay } from "../_actions/log";

/**
 * "Quero jogar": guarda o jogo na sua fila (tenha ou não). Diferente da wishlist,
 * que é para comprar (promoções e lançamento).
 */
export function WantToPlayButton({ gameId, initial, loggedIn, slug }: { gameId: string; initial: boolean; loggedIn: boolean; slug: string }) {
  const router = useRouter();
  const ask = useConfirm();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!loggedIn) {
      router.push(`/login?next=/games/${slug}`);
      return;
    }
    const next = !on;
    startTransition(async () => {
      const res = await setWantToPlay(gameId, next);
      if (!res.ok) {
        await ask({ title: "Não deu certo", description: res.message, notice: true });
        return;
      }
      setOn(next);
      router.refresh(); // o registro abaixo passa a mostrar o status
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={on}
      title={on ? "Na sua fila de Quero jogar" : "Guardar na sua fila do que jogar"}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-60 ${
        on ? "bg-ember-600/20 text-ember-200 ring-1 ring-ember-500/50 hover:bg-ember-600/30" : "border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : on ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      {on ? "Na fila" : "Quero jogar"}
    </button>
  );
}
