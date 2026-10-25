"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { AlertTriangle, KeyRound, Loader2, MailCheck } from "lucide-react";
import { requestPasswordReset, updatePassword } from "../_actions/auth";
import type { AuthFormState } from "../_actions/types";
import { Field } from "./auth-form";

/** Passo 1: pedir o link de redefinição por e-mail. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});

  return (
    <Shell title="Esqueci a senha" subtitle="Informe o e-mail da sua conta e enviamos um link para criar uma nova senha.">
      {state.info ? (
        <Notice tone="ok">{state.info}</Notice>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          <Field label="E-mail" name="email" type="email" autoComplete="email" defaultValue={state.email} />
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <Submit pending={pending}>{pending ? "Enviando…" : "Enviar link"}</Submit>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-zinc-400">
        Lembrou?{" "}
        <Link href="/login" className="font-medium text-sky-400 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </Shell>
  );
}

/** Passo 2: criar a senha nova (aberto pelo link do e-mail). */
export function ResetPasswordForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, {});

  return (
    <Shell title="Criar nova senha" subtitle={email ? `Para a conta ${email}.` : "Escolha uma senha nova."}>
      <form action={action} className="mt-6 space-y-4">
        <Field label="Nova senha" name="password" type="password" autoComplete="new-password" minLength={6} />
        <Field label="Repita a nova senha" name="confirm" type="password" autoComplete="new-password" minLength={6} />
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <Submit pending={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
          {pending ? "Salvando…" : "Salvar nova senha"}
        </Submit>
      </form>
    </Shell>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl shadow-black/20">
      <h1 className="text-2xl font-bold text-zinc-50">{title}</h1>
      <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      {children}
    </section>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  const ok = tone === "ok";
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`mt-6 flex gap-2.5 rounded-lg border p-3 text-sm ${
        ok ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100" : "border-red-500/30 bg-red-500/[0.07] text-red-100"
      }`}
    >
      {ok ? <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <p>{children}</p>
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
