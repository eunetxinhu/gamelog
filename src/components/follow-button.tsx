"use client";

import { useState, useTransition } from "react";
import { Clock, Loader2, UserCheck, UserPlus } from "lucide-react";
import { toggleFollow, type FollowState } from "@/app/(app)/_actions/social";

/** Seguir / Solicitado (perfil privado) / Seguindo. */
export function FollowButton({ userId, state: initial, isPrivate }: { userId: string; state: FollowState; isPrivate?: boolean }) {
  const [state, setState] = useState<FollowState>(initial);
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await toggleFollow(userId);
      if (res.ok && res.state !== undefined) setState(res.state);
      else if (res.message) alert(res.message);
    });
  }

  const label = state === "ACCEPTED" ? "Seguindo" : state === "PENDING" ? "Solicitado" : isPrivate ? "Pedir para seguir" : "Seguir";
  const Icon = state === "ACCEPTED" ? UserCheck : state === "PENDING" ? Clock : UserPlus;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      title={state === "PENDING" ? "Clique para cancelar o pedido" : undefined}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
        state ? "border border-zinc-700 text-zinc-200 hover:bg-zinc-800" : "bg-sky-600 text-white hover:bg-sky-500"
      }`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
      {label}
    </button>
  );
}
