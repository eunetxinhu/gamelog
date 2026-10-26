"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Mail, MoreHorizontal } from "lucide-react";
import { blockUser, unblockUser } from "@/app/(app)/_actions/moderation";
import { ReportButton } from "./report-button";
import { useConfirm } from "@/components/confirm-dialog";

/** Ações sobre outro perfil: mensagem, bloquear/desbloquear e denunciar. */
export function ProfileMenu({ userId, username, blocked: initialBlocked, canMessage }: { userId: string; username: string; blocked: boolean; canMessage: boolean }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [pending, startTransition] = useTransition();
  const ask = useConfirm();

  async function toggleBlock() {
    if (
      !blocked &&
      !(await ask({
        title: `Bloquear @${username}?`,
        description: "Vocês deixam de se seguir e não verão mais o conteúdo um do outro. Dá para desbloquear depois.",
        confirmLabel: "Bloquear",
      }))
    )
      return;
    startTransition(async () => {
      const res = blocked ? await unblockUser(userId) : await blockUser(userId);
      if (res.ok) {
        setBlocked(!blocked);
        setOpen(false);
        window.location.reload();
      }
    });
  }

  return (
    <div className="relative flex gap-2">
      {canMessage && !blocked && (
        <Link
          href={`/mensagens/${username}`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
        >
          <Mail className="size-4" aria-hidden /> Mensagem
        </Link>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Mais opções"
        className="rounded-lg border border-zinc-700 p-2 text-zinc-300 transition hover:bg-zinc-800"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
          <button
            type="button"
            onClick={toggleBlock}
            disabled={pending}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            <Ban className="size-4" aria-hidden /> {blocked ? "Desbloquear" : "Bloquear"}
          </button>
          <ReportButton
            targetType="USER"
            targetId={userId}
            label="Denunciar perfil"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
          />
        </div>
      )}
    </div>
  );
}
