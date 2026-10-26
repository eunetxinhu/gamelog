"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag } from "lucide-react";
import { toggleWishlist } from "../_actions/wishlist";

/** Wishlist (quero comprar): avisa quando o jogo entrar em promoção ou for lançado. Sai sozinha quando o jogo entra na biblioteca. */
export function WishlistButton({ gameId, initial, loggedIn, slug }: { gameId: string; initial: boolean; loggedIn: boolean; slug: string }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!loggedIn) {
      router.push(`/login?next=/games/${slug}`);
      return;
    }
    startTransition(async () => {
      const res = await toggleWishlist(gameId);
      if (res.ok && res.wishlisted !== undefined) setOn(res.wishlisted);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={on}
      title={on ? "Na sua wishlist: avisamos de promoções e do lançamento" : "Quero comprar: avisar de promoções e do lançamento"}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-60 ${
        on ? "bg-emerald-600/15 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-600/25" : "border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Tag className={`size-4 ${on ? "fill-emerald-400/30" : ""}`} aria-hidden />}
      {on ? "Na wishlist" : "Wishlist"}
    </button>
  );
}
