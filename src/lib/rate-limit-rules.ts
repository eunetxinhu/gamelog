// Regras e contas do limite de requisições. Sem acesso a banco: testável e usado
// também no client para formatar mensagens, se precisar.

export type Rule = { limit: number; windowSec: number };

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Quantas vezes cada ação pode acontecer por janela. Cada ação tem uma janela curta
 * (contra rajadas de bot) e, quando faz sentido, uma diária (contra spam lento).
 * Os números são folgados para uso humano normal.
 */
export const RATE_RULES = {
  // Conta (por IP, que é o que existe antes do login; e por e-mail, contra força bruta)
  "login:ip": [{ limit: 20, windowSec: 15 * MIN }],
  "login:email": [{ limit: 8, windowSec: 15 * MIN }],
  "signup:ip": [{ limit: 5, windowSec: HOUR }, { limit: 20, windowSec: DAY }],
  "reset:ip": [{ limit: 10, windowSec: HOUR }],
  "reset:email": [{ limit: 3, windowSec: HOUR }],
  "password:user": [{ limit: 10, windowSec: HOUR }],
  "steam-login:ip": [{ limit: 20, windowSec: HOUR }],

  // Social (por usuário)
  comment: [{ limit: 8, windowSec: MIN }, { limit: 200, windowSec: DAY }],
  // Conta nova (72 h): conversas com quem ela nunca falou (ver src/lib/trust.ts)
  "dm-new-account": [{ limit: 5, windowSec: DAY }],
  message: [{ limit: 20, windowSec: MIN }, { limit: 500, windowSec: DAY }],
  reaction: [{ limit: 60, windowSec: MIN }],
  follow: [{ limit: 30, windowSec: MIN }, { limit: 300, windowSec: DAY }],
  report: [{ limit: 5, windowSec: MIN }],
  "club-create": [{ limit: 3, windowSec: DAY }],
  wishlist: [{ limit: 60, windowSec: MIN }, { limit: 600, windowSec: DAY }],
  "list-write": [{ limit: 30, windowSec: HOUR }, { limit: 100, windowSec: DAY }],
  "club-post": [{ limit: 10, windowSec: MIN }, { limit: 200, windowSec: DAY }],

  // Publicar e enviar arquivos
  "game-log": [{ limit: 40, windowSec: 10 * MIN }],
  "photo-post": [{ limit: 6, windowSec: 10 * MIN }, { limit: 50, windowSec: DAY }],
  upload: [{ limit: 30, windowSec: 10 * MIN }, { limit: 150, windowSec: DAY }],
  search: [{ limit: 60, windowSec: MIN }],

  // Erros que o navegador relata (por IP)
  "error-report": [{ limit: 20, windowSec: HOUR }],
  // Medições de velocidade (cada página manda 1 ou 2 lotes)
  vitals: [{ limit: 300, windowSec: HOUR }],
  // Relatórios de bloqueio da CSP
  "csp-report": [{ limit: 30, windowSec: HOUR }],

  // Dados da conta
  "data-export": [{ limit: 3, windowSec: DAY }],
  "account-delete": [{ limit: 5, windowSec: HOUR }],
} as const satisfies Record<string, readonly Rule[]>;

export type RateAction = keyof typeof RATE_RULES;

/** Início da janela fixa que contém `nowMs`. */
export function windowStart(nowMs: number, windowSec: number): Date {
  const size = windowSec * 1000;
  return new Date(Math.floor(nowMs / size) * size);
}

/** Segundos até a janela acabar (mínimo 1). */
export function secondsUntilReset(nowMs: number, windowSec: number): number {
  const end = windowStart(nowMs, windowSec).getTime() + windowSec * 1000;
  return Math.max(1, Math.ceil((end - nowMs) / 1000));
}

/** Chave da linha em rate_limits. */
export function rateKey(action: RateAction, windowSec: number, subject: string): string {
  return `${action}:${windowSec}:${subject}`.slice(0, 160);
}

/** "Tente de novo em 40 s / 3 min / 2 h". */
export function retryMessage(seconds: number): string {
  if (seconds < 60) return `Muitas tentativas. Tente de novo em ${seconds} s.`;
  if (seconds < 3600) return `Muitas tentativas. Tente de novo em ${Math.ceil(seconds / 60)} min.`;
  return `Você atingiu o limite por hoje. Tente de novo em ${Math.ceil(seconds / 3600)} h.`;
}

/**
 * Dada a contagem (já incrementada) de cada janela, decide se passa.
 * Devolve o maior tempo de espera entre as janelas estouradas.
 */
export function evaluate(
  rules: readonly Rule[],
  counts: number[],
  nowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  let wait = 0;
  rules.forEach((rule, i) => {
    if (counts[i] > rule.limit) wait = Math.max(wait, secondsUntilReset(nowMs, rule.windowSec));
  });
  return wait > 0 ? { ok: false, retryAfterSec: wait } : { ok: true };
}
