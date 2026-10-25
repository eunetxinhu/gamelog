"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Heart, Trash2 } from "lucide-react";
import { deleteActivity, toggleLike } from "@/app/(app)/_actions/social";

/** Curtir (com atualização otimista). Sem login, leva para o login. */
export function LikeButton({ activityId, liked, count, canLike }: { activityId: string; liked: boolean; count: number; canLike: boolean }) {
  const [state, setState] = useState({ liked, count });
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [, startTransition] = useTransition();

  function onClick() {
    if (!canLike) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const next = { liked: !optimistic.liked, count: optimistic.count + (optimistic.liked ? -1 : 1) };
    startTransition(async () => {
      setOptimistic(next);
      const res = await toggleLike(activityId);
      if (res.ok) setState(next);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={optimistic.liked}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition hover:bg-zinc-800 ${
        optimistic.liked ? "text-rose-400" : "text-zinc-400"
      }`}
    >
      <Heart className={`size-4 ${optimistic.liked ? "fill-rose-400" : ""}`} aria-hidden />
      {optimistic.count > 0 && optimistic.count}
      <span className="sr-only">{optimistic.liked ? "Descurtir" : "Curtir"}</span>
    </button>
  );
}

/** Apagar publicação própria. */
export function DeleteActivityButton({ activityId }: { activityId: string }) {
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Apagar esta publicação?")) return;
        startTransition(async () => {
          if ((await deleteActivity(activityId)).ok) setGone(true);
        });
      }}
      className="inline-flex items-center rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-red-300 disabled:opacity-50"
      aria-label="Apagar publicação"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}
