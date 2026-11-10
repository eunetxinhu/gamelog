"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { safeNext, type AuthFormState } from "./types";
import { cleanRef } from "@/lib/referral";
import { clientIpHash, hashSubject, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth";
import { authenticate, consumeToken, createEmailAccount, isEmail, normalizeEmail, sendPasswordReset, sendVerificationEmail, setPassword } from "@/lib/auth/accounts";
import { endSession, startSession } from "@/lib/session";
import { emailEnabled } from "@/lib/email";
import { passwordProblem } from "@/lib/password";

const USERNAME = /^[a-z0-9_]{3,30}$/;

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!email || !password) return { error: "Preencha e-mail e senha.", email };

  const ip = await rateLimit("login:ip", await clientIpHash());
  if (!ip.ok) return { error: ip.message, email };
  const byEmail = await rateLimit("login:email", hashSubject(email));
  if (!byEmail.ok) return { error: byEmail.message, email };

  const res = await authenticate(email, password);
  if (!res.ok) {
    if (res.error === "unverified") {
      await sendVerificationEmail(res.userId, normalizeEmail(email));
      return { email, error: "Confirme seu e-mail antes de entrar. Mandamos um link novo agora (veja também o spam)." };
    }
    return { error: "E-mail ou senha incorretos.", email };
  }
  await startSession(res.userId);
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
  if (!isEmail(email)) return { ...keep, error: "Informe um e-mail válido." };
  const weak = passwordProblem(password);
  if (weak) return { ...keep, error: weak };

  const limit = await rateLimit("signup:ip", await clientIpHash());
  if (!limit.ok) return { ...keep, error: limit.message };

  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (taken) return { ...keep, error: "Esse nome de usuário já está em uso." };

  const res = await createEmailAccount({ email, password, username, ref: cleanRef(formData.get("ref")) });
  if (!res.ok) return { ...keep, error: res.error === "email_taken" ? "Já existe uma conta com esse e-mail." : "Esse nome de usuário já está em uso." };

  if (res.verified) {
    await startSession(res.userId);
    redirect(next);
  }
  return { ...keep, info: `Enviamos um link de confirmação para ${email}. Abra-o para ativar sua conta.` };
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

/**
 * "Esqueci a senha": manda o link de redefinição. A resposta é sempre a mesma,
 * exista ou não a conta, para não revelar quais e-mails estão cadastrados.
 */
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe seu e-mail." };
  if (!emailEnabled()) return { email, error: "O envio de e-mails está desligado agora. Fale com a moderação." };

  // Mesmo bloqueado, a resposta não pode revelar se o e-mail existe
  const ip = await rateLimit("reset:ip", await clientIpHash());
  const byEmail = ip.ok ? await rateLimit("reset:email", hashSubject(email)) : ip;
  if (!byEmail.ok) return { email, error: byEmail.message };

  await sendPasswordReset(email);
  return {
    email,
    info: `Se existir uma conta com ${email}, enviamos um link para criar uma nova senha (veja também o spam). Ele vale por 1 hora.`,
  };
}

/** Define a nova senha: pelo link do e-mail (token) ou logado. Derruba as outras sessões. */
export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const token = String(formData.get("token") ?? "") || null;
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  if (password !== confirm) return { error: "As senhas não são iguais." };

  const current = token ? null : await getCurrentUser();
  const limit = await rateLimit("password:user", current?.id ?? (await clientIpHash()));
  if (!limit.ok) return { error: limit.message };

  const userId = token ? await consumeToken(token, "RESET_PASSWORD") : (current?.id ?? null);
  if (!userId) return { error: "O link de redefinição expirou ou já foi usado. Peça um novo." };

  await setPassword(userId, password);
  // Quem pediu pelo e-mail provou que é dono dele
  if (token) await prisma.authAccount.updateMany({ where: { userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  await startSession(userId);
  redirect("/feed?senha=alterada");
}
