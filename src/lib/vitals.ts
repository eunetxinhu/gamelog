// Web Vitals: limites do Google, agrupamento de páginas e validação do que o navegador manda
// (sem banco: testável).

export const VITAL_NAMES = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];

/** [bom até, ruim acima de] — os limites usados pelo Google (p75). CLS sem unidade; o resto em ms. */
export const VITAL_THRESHOLDS: Record<VitalName, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export const VITAL_LABEL: Record<VitalName, string> = {
  LCP: "Maior elemento na tela",
  INP: "Resposta ao toque",
  CLS: "Tela pulando",
  FCP: "Primeiro conteúdo",
  TTFB: "Resposta do servidor",
};

export type VitalRating = "good" | "needs-improvement" | "poor";

export function rateVital(name: VitalName, value: number): VitalRating {
  const [good, poor] = VITAL_THRESHOLDS[name];
  return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor";
}

export function formatVital(name: VitalName, value: number): string {
  if (name === "CLS") return value.toFixed(2);
  return value >= 1000 ? `${(value / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(value)} ms`;
}

/** Agrupa a página: /u/neto/jogos → /u/:usuario/jogos, /games/elden-ring → /games/:jogo… */
export function routeOf(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const dynamic: Record<string, string> = { u: ":usuario", games: ":jogo", p: ":id", listas: ":id", clubes: ":clube", mensagens: ":usuario", convite: ":usuario" };
  // Páginas fixas dentro dessas seções (não são ids)
  const fixed: Record<string, string[]> = { listas: ["nova"], games: [] };
  const out = parts.map((seg, i) => {
    if (i === 1 && dynamic[parts[0]] && !(fixed[parts[0]] ?? []).includes(seg)) return dynamic[parts[0]];
    return /^[a-z0-9-]{1,30}$/.test(seg) ? seg : ":x";
  });
  return ("/" + out.join("/")).slice(0, 120);
}

export type VitalSample = { name: VitalName; value: number; route: string; device: "mobile" | "desktop" };

/** Confere o que veio do navegador; descarta o que não faz sentido. Máximo 20 por envio. */
export function parseVitals(body: unknown): VitalSample[] {
  if (!Array.isArray(body)) return [];
  const out: VitalSample[] = [];
  for (const raw of body.slice(0, 20)) {
    if (!raw || typeof raw !== "object") continue;
    const { name, value, path, device } = raw as Record<string, unknown>;
    if (typeof name !== "string" || !(VITAL_NAMES as readonly string[]).includes(name)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    if (name === "CLS" ? value > 10 : value > 120_000) continue;
    if (typeof path !== "string" || !path.startsWith("/") || path.length > 500) continue;
    out.push({ name: name as VitalName, value, route: routeOf(path), device: device === "mobile" ? "mobile" : "desktop" });
  }
  return out;
}
