// De quanto em quanto tempo o cron sincroniza a Steam de cada pessoa (sem banco: testável).

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type SyncTier = "ACTIVE" | "REGULAR" | "DORMANT";

/** Intervalo de cada faixa. */
export const SYNC_INTERVAL: Record<SyncTier, number> = {
  ACTIVE: 3 * HOUR, // jogou nas últimas 2 semanas ou abriu o site há pouco
  REGULAR: DAY,
  DORMANT: 3 * DAY, // não joga há 2 semanas e não aparece há um mês
};

/** Depois de uma falha que não é culpa da pessoa (Steam fora, limite da API). */
export const RETRY_AFTER_ERROR = HOUR;

/**
 * Faixa de atividade:
 *  - ACTIVE: tem horas nas últimas 2 semanas, ou visitou o site nos últimos 3 dias
 *  - DORMANT: sem horas recentes e sem visita há mais de 30 dias
 *  - REGULAR: o resto
 */
export function syncTier(input: { minutesLast2Weeks: number; lastSeenAt: Date | null; now?: Date }): SyncTier {
  const now = input.now ?? new Date();
  const sinceSeen = input.lastSeenAt ? now.getTime() - input.lastSeenAt.getTime() : Infinity;
  if (input.minutesLast2Weeks > 0 || sinceSeen <= 3 * DAY) return "ACTIVE";
  if (sinceSeen > 30 * DAY) return "DORMANT";
  return "REGULAR";
}

export function nextSyncAt(input: { minutesLast2Weeks: number; lastSeenAt: Date | null; now?: Date }): Date {
  const now = input.now ?? new Date();
  return new Date(now.getTime() + SYNC_INTERVAL[syncTier({ ...input, now })]);
}

/** Visita registrada no máximo 1x por hora (evita um UPDATE a cada página aberta). */
export function shouldTouchLastSeen(lastSeenAt: Date | null, now = new Date()): boolean {
  return !lastSeenAt || now.getTime() - lastSeenAt.getTime() > HOUR;
}
