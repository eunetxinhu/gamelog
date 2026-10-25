// Datas de lançamento como a loja da Steam escreve. Sem banco nem rede: testável.

const MONTHS: Record<string, number> = {
  jan: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4, jun: 5, jul: 6,
  ago: 7, aug: 7, set: 8, sep: 8, out: 9, oct: 9, nov: 10, dez: 11, dec: 11,
};

export type StoreRelease = {
  /** Só quando a loja dá o dia exato (UTC, meia-noite) */
  date: Date | null;
  /** Texto original quando não há dia exato ("1º tri. 2027", "Em breve", "2027") */
  text: string | null;
};

/**
 * A loja manda a data como texto localizado: "12 nov. 2015", "12 de nov. de 2015",
 * "Nov 12, 2015", "12 Nov, 2015" — e, para o que não lançou, "Em breve", "Q1 2027",
 * "2027", "novembro de 2026". Só vira data quando tem dia, mês e ano: um "2027"
 * não pode virar 1º de janeiro no calendário de lançamentos.
 */
export function parseStoreRelease(raw: string | null | undefined): StoreRelease {
  const text = raw?.trim() ?? "";
  if (!text) return { date: null, text: null };
  const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // dia antes do mês: "12 nov. 2015", "12 de novembro de 2015", "12 Nov, 2015"
  const dayFirst = lower.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z.]*,?\s*(?:de\s+)?(\d{4})\b/);
  // mês antes do dia: "Nov 12, 2015"
  const monthFirst = lower.match(/\b([a-z]{3})[a-z.]*\s+(\d{1,2}),?\s+(\d{4})\b/);

  const build = (d: string, m: string, y: string) => {
    const month = MONTHS[m];
    const day = Number(d);
    const year = Number(y);
    if (month === undefined || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month, day));
    return date.getUTCMonth() === month ? date : null; // 31 fev → inválido
  };

  const date = (dayFirst && build(dayFirst[1], dayFirst[2], dayFirst[3])) || (monthFirst && build(monthFirst[2], monthFirst[1], monthFirst[3])) || null;
  return date ? { date, text: null } : { date: null, text };
}

/** "AAAA-MM-DD" do dia de hoje no fuso de São Paulo (usado para "lança hoje"). */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Data de lançamento (meia-noite UTC, como vem do banco) → "AAAA-MM-DD". */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Diferença em dias entre duas datas "AAAA-MM-DD" (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
