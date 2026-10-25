"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Heart, Trash2, Trophy } from "lucide-react";
import { deleteActivity, toggleReaction } from "@/app/(app)/_actions/social";

const REACTION = {
  LIKE: { label: "Curtir", undo: "Descurtir", on: "text-rose-400", icon: (on: boolean) => <Heart className={`size-4 ${on ? "fill-rose-400" : ""}`} aria-hidden /> },
  GG: { label: "Mandar GG", undo: "Tirar GG", on: "text-amber-300", icon: () => <Trophy className="size-4" aria-hidden /> },
} as const;

/** Curtida ou GG, com atualização otimista. Sem login, leva para o login. */
export function ReactionButton({
  activityId,
  type,
  active,
  count,
  canReact,
}: {
  activityId: string;
  type: "LIKE" | "GG";
  active: boolean;
  count: number;
  canReact: boolean;
}) {
  const r = REACTION[type];
  const [state, setState] = useState({ active, count });
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [, startTransition] = useTransition();

  function onClick() {
    if (!canReact) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const next = { active: !optimistic.active, count: optimistic.count + (optimistic.active ? -1 : 1) };
    startTransition(async () => {
      setOptimistic(next);
      const res = await toggleReaction(activityId, type);
      if (res.ok) setState(next);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={optimistic.active}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-sm transition hover:bg-zinc-800 active:scale-95 sm:min-h-0 sm:px-2.5 ${
        optimistic.active ? r.on : "text-zinc-400"
      } ${type === "GG" && optimistic.active ? "bg-amber-400/10" : ""}`}
    >
      {r.icon(optimistic.active)}
      {type === "GG" && <span className="text-xs font-bold">GG</span>}
      {optimistic.count > 0 && optimistic.count}
      <span className="sr-only">{optimistic.active ? r.undo : r.label}</span>
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
