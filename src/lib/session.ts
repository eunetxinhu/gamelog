import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashToken, isTokenShape, newToken } from "@/lib/auth/tokens";

/** Cookie da sessão. Só o servidor lê (httpOnly); o banco guarda só o hash. */
export const SESSION_COOKIE = "pg_session";
const SESSION_DAYS = 30;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const DAY = 86_400_000;

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});

/** Abre uma sessão para a pessoa e grava o cookie (Server Action ou Route Handler). */
export async function startSession(userId: string) {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await prisma.session.create({ data: { tokenHash: hash, userId, expiresAt, userAgent: ua } });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/**
 * Id de quem está logado (ou null). Renova o prazo no máximo 1x por dia, para quem
 * usa o site não ser deslogado no meio, sem escrever no banco a cada página.
 */
export async function sessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!isTokenShape(token)) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, userId: true, expiresAt: true, renewedAt: true } });
  const now = Date.now();
  if (!session || session.expiresAt.getTime() <= now) return null;
  if (now - session.renewedAt.getTime() > RENEW_AFTER_MS) {
    const expiresAt = new Date(now + SESSION_DAYS * DAY);
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt, renewedAt: new Date(now) } }).catch(() => {});
    // Em Server Component não dá para gravar cookie: o prazo novo vale no banco e o cookie é atualizado no próximo login
    try {
      store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
    } catch {
      /* lendo dentro de uma página */
    }
  }
  return session.userId;
}

/** Sai: apaga a sessão no banco e o cookie. */
export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (isTokenShape(token)) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Derruba todas as sessões da pessoa (troca de senha, conta suspensa). */
export async function endAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Apaga sessões e links vencidos (cron diário). */
export async function cleanupSessions() {
  const now = new Date();
  const [s, t] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
  ]);
  return s.count + t.count;
}
