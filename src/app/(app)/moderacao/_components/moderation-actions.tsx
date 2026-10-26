"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moderateReport, setBanned } from "@/app/(app)/_actions/moderation";
import { useConfirm } from "@/components/confirm-dialog";

export function ModerationActions({ reportId, canBan }: { reportId: string; canBan: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ask = useConfirm();

  async function run(action: "dismiss" | "remove" | "ban") {
    if (action === "ban") {
      const done = await ask({
        title: "Remover o conteúdo e suspender o autor?",
        description: "A conta fica suspensa até alguém da moderação reverter.",
        confirmLabel: "Remover e suspender",
        action: () => moderateReport(reportId, action),
      });
      if (done) router.refresh();
      return;
    }
    startTransition(async () => {
      if ((await moderateReport(reportId, action)).ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} onClick={() => run("dismiss")} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
        Dispensar
      </button>
      <button type="button" disabled={pending} onClick={() => run("remove")} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50">
        Remover conteúdo
      </button>
      {canBan && (
        <button type="button" disabled={pending} onClick={() => run("ban")} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
          Remover e suspender autor
        </button>
      )}
    </div>
  );
}

export function UnbanButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if ((await setBanned(userId, false)).ok) router.refresh();
        })
      }
      className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
    >
      Reativar
    </button>
  );
}
