"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { deleteMyAccount, type DeleteAccountState } from "../_actions/delete-account";

/** Zona de perigo: exclusão da conta com confirmação digitada. */
export function DeleteAccountForm({ username, available }: { username: string; available: boolean }) {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteMyAccount, {});
  const [typed, setTyped] = useState("");
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === username;

  return (
    <form action={action} className="space-y-3">
      <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
        <li>Seu perfil, registros, reviews, publicações, fotos, comentários e mensagens são apagados.</li>
        <li>Sua Steam é desvinculada e pode ser usada em outra conta depois.</li>
        <li>Clubes que você criou passam para o administrador (ou membro) mais antigo.</li>
        <li>Não dá para desfazer. Se quiser guardar uma cópia, baixe seus dados antes.</li>
      </ul>

      <label htmlFor="confirm" className="block text-sm text-zinc-300">
        Para confirmar, digite <strong className="text-zinc-50">@{username}</strong>
      </label>
      <input
        id="confirm"
        name="confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={!available || pending}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-50"
        placeholder={`@${username}`}
      />

      {state.error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.error}
        </p>
      )}
      {!available && <p className="text-sm text-amber-300">A exclusão automática não está configurada neste servidor.</p>}

      <button
        type="submit"
        disabled={!available || !matches || pending}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
        {pending ? "Excluindo…" : "Excluir minha conta"}
      </button>
    </form>
  );
}
