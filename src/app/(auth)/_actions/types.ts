// Tipos e helpers compartilhados entre as Server Actions de auth e os formulários.
// (Arquivos "use server" só podem exportar funções async, por isso ficam aqui.)

export type AuthFormState = {
  error?: string;
  info?: string;
  /** Valores devolvidos para o formulário não perder o que foi digitado */
  email?: string;
  username?: string;
};

export const DEFAULT_AFTER_LOGIN = "/feed";

/**
 * Só aceita caminhos internos (evita redirecionar para outro site via ?next=).
 * Recusa barra invertida e caracteres de controle: o navegador apaga TAB e quebra de linha
 * da URL, então "/<TAB>/site.com" viraria "//site.com" (outro site).
 * No fim confere de verdade: resolvido contra um domínio qualquer, tem que continuar nele.
 */
export function safeNext(value: FormDataEntryValue | string | null | undefined) {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.length > 2000 || /[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_AFTER_LOGIN;
  if (next.startsWith("//")) return DEFAULT_AFTER_LOGIN;
  try {
    const resolved = new URL(next, "https://interno.invalid");
    return resolved.origin === "https://interno.invalid" ? next : DEFAULT_AFTER_LOGIN;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}
