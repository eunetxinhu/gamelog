"use client";

import Link from "next/link";
import { useActionState, type ComponentProps, type ReactNode } from "react";
import { AlertTriangle, Loader2, MailCheck } from "lucide-react";
import { signIn, signUp } from "../_actions/auth";
import type { AuthFormState } from "../_actions/types";

type Props = { mode: "login" | "signup"; next: string; notice?: string; steamLogin?: boolean };

export function AuthForm({ mode, next, notice, steamLogin }: Props) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(isSignup ? signUp : signIn, {});
  const otherHref = `${isSignup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`;

  return (
    <section className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl shadow-black/20">
      <h1 className="text-2xl font-bold text-zinc-50">{isSignup ? "Criar conta" : "Entrar"}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {isSignup ? "Registre, avalie e acompanhe seus jogos." : "Bem-vindo de volta ao GameLog."}
      </p>

      {state.info ? (
        <div role="status" className="mt-6 flex gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-3 text-sm text-emerald-100">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{state.info}</p>
        </div>
      ) : (
        <>
          {steamLogin && (
            <>
              {/* Link comum (não <Link>): a rota redireciona para o site da Steam */}
              <a
                href="/api/steam/login"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1b2838] px-3.5 py-2.5 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-[#2a475e]"
              >
                <SteamIcon />
                {isSignup ? "Criar conta com Steam" : "Entrar com Steam"}
              </a>
              <div className="mt-6 flex items-center gap-3 text-xs text-zinc-500">
                <span className="h-px flex-1 bg-zinc-800" />
                ou com e-mail
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
            </>
          )}
          <form action={action} className={`${steamLogin ? "mt-4" : "mt-6"} space-y-4`}>
            <input type="hidden" name="next" value={next} />

            {isSignup && (
              <Field label="Nome de usuário" name="username" autoComplete="username" defaultValue={state.username} placeholder="seu_nick" />
            )}
            <Field label="E-mail" name="email" type="email" autoComplete="email" defaultValue={state.email} />
            <Field
              label="Senha"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 6 : undefined}
              aside={
                !isSignup && (
                  <Link href="/forgot-password" className="text-xs font-normal text-sky-400 hover:underline">
                    Esqueci a senha
                  </Link>
                )
              }
            />

            {(state.error || notice) && (
              <div role="alert" className="flex gap-2.5 rounded-lg border border-red-500/30 bg-red-500/[0.07] p-3 text-sm text-red-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{state.error ?? notice}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {isSignup ? (pending ? "Criando…" : "Criar conta") : pending ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-zinc-400">
        {isSignup ? "Já tem conta? " : "Ainda não tem conta? "}
        <Link href={otherHref} className="font-medium text-sky-400 hover:underline">
          {isSignup ? "Entrar" : "Criar conta"}
        </Link>
      </p>
    </section>
  );
}

function SteamIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M11.98 0C5.67 0 .5 4.86.02 11.02l6.43 2.66a3.4 3.4 0 0 1 1.92-.59l.17.01 2.86-4.15v-.06a4.53 4.53 0 1 1 4.53 4.53h-.1l-4.08 2.91.01.16a3.4 3.4 0 0 1-6.75.6L.4 15.05A12 12 0 1 0 11.98 0ZM7.54 18.21l-1.47-.61a2.55 2.55 0 1 0 1.4-3.5l1.52.63a1.88 1.88 0 1 1-1.45 3.48Zm11.4-9.27a3.02 3.02 0 1 0-6.04 0 3.02 3.02 0 0 0 6.04 0Zm-5.28 0a2.27 2.27 0 1 1 4.54 0 2.27 2.27 0 0 1-4.54 0Z" />
    </svg>
  );
}

/** Campo dos formulários de auth. `aside` aparece à direita do rótulo (ex.: "Esqueci a senha"). */
export function Field({ label, name, aside, ...rest }: { label: string; name: string; aside?: ReactNode } & ComponentProps<"input">) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={name} className="text-sm font-medium text-zinc-200">
          {label}
        </label>
        {aside}
      </div>
      <input
        id={name}
        name={name}
        required
        spellCheck={false}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        {...rest}
      />
    </div>
  );
}
