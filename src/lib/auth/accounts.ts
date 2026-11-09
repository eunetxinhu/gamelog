import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { AuthTokenKind } from "@/generated/prisma/enums";
import { appUrl } from "@/lib/app-url";
import { emailEnabled, linkEmail, sendEmail } from "@/lib/email";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/password";
import { applyReferral, findInviter } from "@/lib/referral";
import { endAllSessions } from "@/lib/session";
import { hashToken, isTokenShape, newToken } from "./tokens";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (email: string) => email.length <= 254 && EMAIL.test(email);

const TTL: Record<AuthTokenKind, number> = { VERIFY_EMAIL: 48 * 3_600_000, RESET_PASSWORD: 3_600_000 };

/** Cria a conta de e-mail e o perfil juntos. Sem envio de e-mail configurado, já nasce confirmada. */
export async function createEmailAccount({ email, password, username, ref }: { email: string; password: string; username: string; ref: string | null }) {
  const id = randomUUID();
  const inviter = await findInviter(ref);
  const passwordHash = await hashPassword(password);
  const verified = !emailEnabled();
  try {
    await prisma.user.create({
      data: {
        id,
        username,
        invitedById: inviter?.id ?? null,
        authAccount: { create: { email: normalizeEmail(email), passwordHash, emailVerifiedAt: verified ? new Date() : null } },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String((err.meta as { target?: unknown })?.target ?? "");
      return { ok: false as const, error: target.includes("email") ? ("email_taken" as const) : ("username_taken" as const) };
    }
    throw err;
  }
  if (inviter) await applyReferral(id, inviter);
  if (!verified) await sendVerificationEmail(id, email);
  return { ok: true as const, userId: id, verified };
}

/**
 * Confere e-mail e senha. Gasta o mesmo tempo quando o e-mail não existe, para não
 * revelar quem tem conta.
 */
export async function authenticate(email: string, password: string) {
  const account = await prisma.authAccount.findUnique({ where: { email: normalizeEmail(email) }, select: { userId: true, passwordHash: true, emailVerifiedAt: true } });
  const ok = await verifyPassword(password, account?.passwordHash ?? DUMMY_HASH);
  if (!account || !ok) return { ok: false as const, error: "invalid" as const };
  if (!account.emailVerifiedAt && emailEnabled()) return { ok: false as const, error: "unverified" as const, userId: account.userId };
  return { ok: true as const, userId: account.userId };
}

export async function issueToken(userId: string, kind: AuthTokenKind) {
  const { token, hash } = newToken();
  // Um link válido por vez: pedir de novo invalida o anterior
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, kind, usedAt: null } }),
    prisma.authToken.create({ data: { tokenHash: hash, userId, kind, expiresAt: new Date(Date.now() + TTL[kind]) } }),
  ]);
  return token;
}

/** Usa o token (uma vez só, dentro do prazo). Devolve de quem é. */
export async function consumeToken(token: string | null | undefined, kind: AuthTokenKind): Promise<string | null> {
  if (!isTokenShape(token)) return null;
  const hash = hashToken(token);
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hash }, select: { userId: true, kind: true } });
  if (!row || row.kind !== kind) return null;
  // Atômico: dois cliques no mesmo link não usam o token duas vezes
  const { count } = await prisma.authToken.updateMany({ where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  return count === 1 ? row.userId : null;
}

/** O link ainda vale? (para a página de nova senha mostrar o formulário ou o aviso) */
export async function tokenIsValid(token: string | null | undefined, kind: AuthTokenKind): Promise<boolean> {
  if (!isTokenShape(token)) return false;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { kind: true, usedAt: true, expiresAt: true } });
  return Boolean(row && row.kind === kind && !row.usedAt && row.expiresAt > new Date());
}

export async function sendVerificationEmail(userId: string, email: string) {
  const token = await issueToken(userId, "VERIFY_EMAIL");
  const url = new URL("/auth/confirmar", appUrl());
  url.searchParams.set("token", token);
  const body = linkEmail({
    title: "Confirme seu e-mail",
    intro: "Falta só um passo para entrar no Poneglyph.gg.",
    action: "Confirmar e-mail",
    url: url.toString(),
    outro: "O link vale por 48 horas. Se não foi você, é só ignorar.",
  });
  return sendEmail({ to: email, subject: "Confirme seu e-mail no Poneglyph.gg", ...body });
}

/** "Esqueci a senha". Não diz se o e-mail existe. */
export async function sendPasswordReset(email: string) {
  const account = await prisma.authAccount.findUnique({ where: { email: normalizeEmail(email) }, select: { userId: true } });
  if (!account) return;
  const token = await issueToken(account.userId, "RESET_PASSWORD");
  const url = new URL("/reset-password", appUrl());
  url.searchParams.set("token", token);
  const body = linkEmail({
    title: "Criar uma nova senha",
    intro: "Alguém (esperamos que você) pediu para trocar a senha da sua conta.",
    action: "Criar nova senha",
    url: url.toString(),
    outro: "O link vale por 1 hora e só funciona uma vez. Se não foi você, ignore: a senha continua a mesma.",
  });
  await sendEmail({ to: email, subject: "Nova senha no Poneglyph.gg", ...body });
}

export async function markEmailVerified(userId: string) {
  await prisma.authAccount.updateMany({ where: { userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
}

/** Troca a senha e derruba as sessões abertas (quem pegou a senha antiga sai). */
export async function setPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  await prisma.authAccount.upsert({ where: { userId }, create: { userId, passwordHash }, update: { passwordHash } });
  await endAllSessions(userId);
}

/** Conta só da Steam (sem e-mail e senha): a Steam é o único jeito de entrar. */
export async function isSteamOnlyAccount(userId: string): Promise<boolean> {
  const a = await prisma.authAccount.findUnique({ where: { userId }, select: { email: true, passwordHash: true } });
  return !a?.email || !a.passwordHash;
}

/** Contas de e-mail que nunca confirmaram (cron diário). */
export async function cleanupUnverifiedAccounts(days = 7) {
  if (!emailEnabled()) return 0;
  const { count } = await prisma.user.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) }, steamId: null, authAccount: { emailVerifiedAt: null, email: { not: null } } },
  });
  return count;
}
