// Limites de conta nova (sem banco: testável). Freia spam e golpe nos primeiros dias
// sem atrapalhar quem é de verdade: depois do período, tudo libera sozinho.

/** Quanto tempo uma conta é "nova". */
export const NEW_ACCOUNT_HOURS = 72;
/** Conversas novas (com quem nunca falou) por dia para conta nova. */
export const NEW_ACCOUNT_NEW_DMS_PER_DAY = 5;

export function hoursLeft(createdAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil(NEW_ACCOUNT_HOURS - (now.getTime() - createdAt.getTime()) / 3_600_000));
}

/** Conta criada há menos de 72 h (administradores nunca contam como novos). */
export function isNewAccount(user: { createdAt: Date; isAdmin?: boolean }, now = new Date()): boolean {
  return !user.isAdmin && hoursLeft(user.createdAt, now) > 0;
}

// Links: http(s)://, www. e domínios soltos comuns ("site.com/x", "bit.ly/abc", "discord.gg/abc")
const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|gg|ly|me|br|xyz|link|app|site|online|shop|store|ru|tk|top)(\/\S*)?\b/i;

export function containsLink(text: string | null | undefined): boolean {
  return Boolean(text && LINK_RE.test(text));
}

/** Mensagem para quem é conta nova e tentou mandar link. */
export function linkBlockedMessage(createdAt: Date, now = new Date()): string {
  const h = hoursLeft(createdAt, now);
  return `Contas novas ainda não podem postar links (proteção contra spam). Libera em ${h} ${h === 1 ? "hora" : "horas"}.`;
}

/**
 * Confere um texto de uma conta. Devolve a mensagem de erro, ou null se pode publicar.
 * Hoje a regra é só "conta nova não posta link"; os limites de quantidade ficam no rate limit.
 */
export function checkNewAccountText(user: { createdAt: Date; isAdmin?: boolean }, ...texts: (string | null | undefined)[]): string | null {
  if (!isNewAccount(user)) return null;
  return texts.some((t) => containsLink(t)) ? linkBlockedMessage(user.createdAt) : null;
}
