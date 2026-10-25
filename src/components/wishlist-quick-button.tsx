"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { setWishlistBySlug } from "@/app/(app)/_actions/wishlist";

/**
 * Botão de wishlist sobre a capa, nas listas de jogos (como o da Steam): adiciona
 * sem abrir a página do jogo. Fica fora do link da capa (botão dentro de <a> não
 * vale em HTML), posicionado no canto pelo <li> com `relative`.
 */
export function WishlistQuickButton({
  slug,
  title,
  initial,
  loggedIn,
  className = "",
}: {
  slug: string;
  title: string;
  initial: boolean;
  loggedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    const next = !on;
    setOn(next); // otimista: responde na hora
    setError(null);
    startTransition(async () => {
      const res = await setWishlistBySlug(slug, next).catch(() => ({ ok: false as const, error: "Sem conexão. Tente de novo." }));
      if (!res.ok) {
        setOn(!next);
        setError(res.error ?? "Não deu para atualizar a wishlist.");
      }
    });
  }

  const label = on ? `Tirar ${title} da wishlist` : `Adicionar ${title} à wishlist`;
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        aria-label={label}
        title={error ?? (on ? "Na sua wishlist" : "Adicionar à wishlist")}
        data-pending={pending || undefined}
        className={`absolute z-10 grid size-8 place-items-center rounded-full shadow-md ring-1 backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-90 data-[pending]:opacity-80 ${
          on ? "bg-emerald-500 text-zinc-950 ring-emerald-300/50 hover:bg-emerald-400" : "bg-zinc-950/70 text-zinc-100 ring-white/15 hover:bg-zinc-900"
        } ${error ? "ring-2 ring-rose-500" : ""} ${className}`}
      >
        {on ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      </button>
      <span role="status" className="sr-only">
        {error ?? ""}
      </span>
    </>
  );
}
