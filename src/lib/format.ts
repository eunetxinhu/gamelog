// Formatação compartilhada (server e client).

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

/** "há 5 minutos", "ontem", "há 3 semanas"… */
export function relativeTime(date: Date | string) {
  const diffSec = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}

/** Minutos → "12 h" / "1.234 h" / "45 min" */
export function formatPlaytime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60).toLocaleString("pt-BR")} h`;
}

export const STATUS_LABEL = {
  PLAYING: "Jogando",
  COMPLETED: "Finalizado",
  PLATINUM: "Platinado",
  DROPPED: "Dropado",
  // "Quero jogar" = fila do que jogar (tenha ou não). Comprar é a wishlist, à parte.
  BACKLOG: "Quero jogar",
} as const;
