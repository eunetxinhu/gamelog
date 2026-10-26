// Content Security Policy do site (sem rede: testável). Montada a cada request no proxy
// com um nonce novo: só roda script que o próprio servidor marcou com o nonce.

export type CspMode = "enforce" | "report-only" | "off";

/** CSP_MODE na Vercel: "report-only" só registra (para destravar rápido se algo quebrar); "off" desliga. */
export function cspMode(value: string | undefined): CspMode {
  return value === "report-only" || value === "off" ? value : "enforce";
}

/** Nonce aleatório (128 bits) em base64. */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp({ nonce, dev }: { nonce: string; dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Só scripts com o nonce; os que eles carregam (chunks do Next, hls.js) herdam a confiança
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React usa style="" (barras de progresso, notas): precisa de 'unsafe-inline' nos estilos
    "style-src": ["'self'", "'unsafe-inline'"],
    // Capas e avatares vêm de vários CDNs (Steam, RAWG, Supabase)
    "img-src": ["'self'", "data:", "blob:", "https:"],
    // Trailers da Steam (HLS: o hls.js usa blob:)
    "media-src": ["'self'", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    // O hls.js baixa a lista e os pedaços do trailer direto da Steam
    "connect-src": ["'self'", "https://*.steamstatic.com", "https://*.akamaihd.net", ...(dev ? ["ws:", "wss:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": ["/api/csp-report"],
    "report-to": ["csp"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export type CspViolation = { directive: string; blocked: string; page: string | null; source: string | null };

const EXTENSION = /^(chrome|moz|safari|safari-web|ms-browser)-extension:/;

/**
 * Lê um relatório de violação (formato antigo `csp-report` ou o novo Reporting API) e
 * descarta o ruído de extensões do navegador. `null` = ignorar.
 */
export function parseCspReport(body: unknown): CspViolation[] {
  const list = Array.isArray(body) ? body : [body];
  const out: CspViolation[] = [];
  for (const item of list.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const r = (("csp-report" in item ? (item as { "csp-report": unknown })["csp-report"] : (item as { body?: unknown }).body) ?? {}) as Record<string, unknown>;
    const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "").split(" ")[0];
    const blocked = String(r["blocked-uri"] ?? r.blockedURL ?? "");
    const source = (r["source-file"] ?? r.sourceFile ?? null) as string | null;
    const page = (r["document-uri"] ?? r.documentURL ?? null) as string | null;
    if (!directive) continue;
    if (EXTENSION.test(blocked) || (source && EXTENSION.test(source))) continue;
    // Bloqueado = origem só (nunca guarda caminho/consulta de URL de terceiros)
    let blockedOrigin = blocked;
    try {
      blockedOrigin = /^https?:/.test(blocked) ? new URL(blocked).origin : blocked.slice(0, 40);
    } catch {
      blockedOrigin = blocked.slice(0, 40);
    }
    let pagePath: string | null = null;
    try {
      pagePath = page ? new URL(page).pathname : null;
    } catch {
      pagePath = null;
    }
    out.push({ directive: directive.slice(0, 40), blocked: blockedOrigin, page: pagePath, source: source ? source.slice(0, 200) : null });
  }
  return out;
}
