import bcrypt from "bcryptjs";

/**
 * Senhas com bcrypt (custo 10): o mesmo formato que o Supabase Auth usava ($2a$/$2b$),
 * então as senhas importadas de lá continuam valendo sem ninguém precisar trocar.
 */
const COST = 10;
export const MIN_PASSWORD = 6;
/** bcrypt só usa os primeiros 72 bytes; acima disso recusa em vez de cortar calado */
export const MAX_PASSWORD_BYTES = 72;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return "Senha longa demais (máximo 72 caracteres).";
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Confere a senha. Hash ausente ou de outro formato = não confere. */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash || !/^\$2[aby]\$\d{2}\$/.test(hash)) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Hash de mentira para gastar o mesmo tempo quando o e-mail não existe (não revela quem tem conta). */
export const DUMMY_HASH = "$2b$10$YzGfOoEZA26ITZwMMCRImOQRp7ouI.DmvSwe3nmM1RWiyFbbXnHa6";
