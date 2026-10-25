// Agrupamento do calendário de lançamentos (sem banco: testável).
import { daysBetween } from "@/lib/steam/dates";

export type ReleaseItem<G> = {
  game: G;
  /** "AAAA-MM-DD" quando há dia exato */
  day: string | null;
  comingSoon: boolean;
  /** Texto da loja quando não há dia exato */
  text: string | null;
};

export type ReleaseCalendar<G> = {
  today: ReleaseItem<G>[];
  /** Próximos, por mês ("2026-11"), em ordem */
  upcoming: { month: string; items: ReleaseItem<G>[] }[];
  /** Anunciados sem dia exato ("Em breve", "Q1 2027") */
  undated: ReleaseItem<G>[];
  /** Lançados nos últimos RECENT_DAYS dias, mais novos primeiro */
  recent: ReleaseItem<G>[];
};

export const RECENT_DAYS = 30;

export function groupReleases<G>(items: ReleaseItem<G>[], today: string): ReleaseCalendar<G> {
  const out: ReleaseCalendar<G> = { today: [], upcoming: [], undated: [], recent: [] };
  const byMonth = new Map<string, ReleaseItem<G>[]>();

  for (const item of items) {
    if (!item.day) {
      if (item.comingSoon) out.undated.push(item);
      continue;
    }
    const diff = daysBetween(today, item.day);
    if (diff === 0) out.today.push(item);
    else if (diff > 0) {
      const month = item.day.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
    } else if (diff >= -RECENT_DAYS) out.recent.push(item);
    // lançado há mais tempo: fora do calendário
  }

  out.upcoming = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => ({ month, items: list.sort((a, b) => a.day!.localeCompare(b.day!)) }));
  out.recent.sort((a, b) => b.day!.localeCompare(a.day!));
  return out;
}

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-11" → "novembro de 2026" */
export function monthLabel(month: string): string {
  return monthFmt.format(new Date(`${month}-01T00:00:00Z`));
}

/** Quanto falta: "amanhã", "em 5 dias", "em 3 semanas". */
export function untilLabel(today: string, day: string): string {
  const d = daysBetween(today, day);
  if (d <= 0) return d === 0 ? "hoje" : `há ${-d} ${d === -1 ? "dia" : "dias"}`;
  if (d === 1) return "amanhã";
  if (d < 14) return `em ${d} dias`;
  if (d < 60) return `em ${Math.round(d / 7)} semanas`;
  return `em ${Math.round(d / 30)} meses`;
}
