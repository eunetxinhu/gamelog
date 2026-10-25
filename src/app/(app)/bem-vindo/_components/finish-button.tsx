"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { finishOnboarding } from "../_actions/onboarding";

/** "Li as regras e quero começar": só libera depois de marcar que leu. */
export function FinishOnboarding() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 text-sm text-zinc-200">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-sky-500" />
        Li as regras da comunidade e concordo em segui-las.
      </label>
      <button
        type="button"
        disabled={!agreed || pending}
        onClick={() =>
          startTransition(async () => {
            await finishOnboarding();
            router.push("/feed");
          })
        }
        className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Começar a jogar
      </button>
    </div>
  );
}

/** "Agora não" no convite do feed: some e não volta. */
export function DismissOnboarding() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await finishOnboarding();
          router.refresh();
        })
      }
      aria-label="Dispensar primeiros passos"
      className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
