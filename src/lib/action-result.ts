// Formato único das respostas das Server Actions de excluir/remover (e de quem quiser seguir).
// A janela de confirmação (components/confirm-dialog.tsx) mostra `message` quando dá errado.

export type ActionResult = { ok: true } | { ok: false; message: string };

export const ok = (): ActionResult => ({ ok: true });
export const fail = (message: string): ActionResult => ({ ok: false, message });

/** Mensagens repetidas em várias ações. */
export const MSG = {
  login: "Sua sessão expirou. Entre de novo.",
  notAllowed: "Você não tem permissão para isso.",
} as const;
