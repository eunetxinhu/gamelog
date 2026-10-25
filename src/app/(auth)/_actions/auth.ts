"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/app-url";
import { safeNext, type AuthFormState } from "./types";

const USERNAME = /^[a-z0-9_]{3,30}$/;

/** Mensagens em pt-BR para os códigos de erro do Supabase Auth. */
function authMessage(code: string | undefined, fallback: string) {
  switch (code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail antes de entrar. Procure o link que enviamos (veja também o spam).";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com esse e-mail.";
    case "weak_password":
      return "Senha fraca. Use pelo menos 6 caracteres.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "signup_disabled":
      return "Novos cadastros estão desativados.";
    default:
      console.error("[auth]", code, fallback);
      return "Não foi possível concluir agora. Tente novamente.";
  }
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!email || !password) return { error: "Preencha e-mail e senha.", email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authMessage(error.code, error.message), email };

  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  const keep = { email, username };

  if (!USERNAME.test(username)) {
    return { ...keep, error: "O nome de usuário precisa ter de 3 a 30 caracteres: letras minúsculas, números ou _." };
  }
  if (!email || password.length < 6) return { ...keep, error: "Informe um e-mail e uma senha com pelo menos 6 caracteres." };

  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (taken) return { ...keep, error: "Esse nome de usuário já está em uso." };

  const supabase = await createSupabaseServerClient();
  const callback = new URL("/auth/callback", appUrl());
  callback.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // `username` vira o perfil público no primeiro login (src/lib/auth.ts)
    options: { data: { username }, emailRedirectTo: callback.toString() },
  });
  if (error) return { ...keep, error: authMessage(error.code, error.message) };

  // Confirmação de e-mail desligada no Supabase: já volta com sessão
  if (data.session) redirect(next);

  return { ...keep, info: `Enviamos um link de confirmação para ${email}. Abra-o para ativar sua conta.` };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
