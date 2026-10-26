"use client";

import { useReportWebVitals } from "next/web-vitals";

type Pending = { name: string; value: number; path: string; device: "mobile" | "desktop" };
const queue: Pending[] = [];
let listening = false;

/** Manda o que juntou (sendBeacon sobrevive ao fechar a aba). */
function flush() {
  if (queue.length === 0) return;
  const body = JSON.stringify(queue.splice(0, 20));
  const blob = new Blob([body], { type: "application/json" });
  if (!navigator.sendBeacon?.("/api/vitals", blob)) {
    fetch("/api/vitals", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }
}

/**
 * Mede a velocidade real no navegador de quem usa o site (Web Vitals: LCP, INP, CLS,
 * FCP, TTFB) e manda em lote para /api/vitals. Resultado em /moderacao/desempenho.
 * Não manda nada de quem é: só a métrica, a página (agrupada) e se é celular.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") return;
    queue.push({
      name: metric.name,
      value: metric.value,
      path: window.location.pathname,
      device: window.innerWidth < 768 ? "mobile" : "desktop",
    });
    if (!listening) {
      listening = true;
      addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
      addEventListener("pagehide", flush);
    }
    if (queue.length >= 10) flush();
  });
  return null;
}
