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

/** Só aceita caminhos internos (evita redirecionar para outro site via ?next=). */
export function safeNext(value: FormDataEntryValue | string | null | undefined) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : DEFAULT_AFTER_LOGIN;
}
