import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getVitalsSummary, type VitalStat } from "@/lib/vitals-data";
import { formatVital, rateVital, VITAL_LABEL, VITAL_NAMES, VITAL_THRESHOLDS, type VitalName } from "@/lib/vitals";

export const metadata: Metadata = { title: "Desempenho" };

type Props = { searchParams: Promise<{ periodo?: string; aparelho?: string }> };

/** Menos medições que isso: o número ainda oscila muito. */
const MIN_SAMPLES = 20;
const PERIODS = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;
const TONE = { good: "text-emerald-300", "needs-improvement": "text-amber-300", poor: "text-red-300" } as const;
const DOT = { good: "bg-emerald-400", "needs-improvement": "bg-amber-400", poor: "bg-red-400" } as const;

/** Velocidade real (Web Vitals) medida no navegador de quem usa o site. Só administradores. */
export default async function PerformancePage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const q = await searchParams;
  const periodo = (q.periodo && q.periodo in PERIODS ? q.periodo : "7d") as keyof typeof PERIODS;
  const aparelho = q.aparelho === "celular" ? "mobile" : q.aparelho === "computador" ? "desktop" : null;
  const data = await getVitalsSummary({ hours: PERIODS[periodo], device: aparelho });
  const href = (p: Partial<{ periodo: string; aparelho: string }>) => {
    const sp = new URLSearchParams({ periodo, ...(q.aparelho ? { aparelho: q.aparelho } : {}), ...p });
    if (sp.get("aparelho") === "todos") sp.delete("aparelho");
    return `/moderacao/desempenho?${sp}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/moderacao" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> Moderação
      </Link>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-50">
        <Gauge className="size-6 text-brand-400" aria-hidden /> Desempenho real
      </h1>
      <p className="mb-5 max-w-prose text-sm text-zinc-400">
        Medido no navegador de quem usa o site. Cada número é o <strong className="text-zinc-200">p75</strong>: 3 de cada 4 visitas foram assim ou mais
        rápidas (é como o Google avalia). Verde = bom, amarelo = melhorar, vermelho = ruim.
      </p>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Filtros">
        {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((p) => (
          <Chip key={p} href={href({ periodo: p })} active={p === periodo}>
            {p === "24h" ? "24 horas" : p === "7d" ? "7 dias" : "30 dias"}
          </Chip>
        ))}
        <span className="mx-1 w-px bg-zinc-800" aria-hidden />
        {(["todos", "celular", "computador"] as const).map((a) => (
          <Chip key={a} href={href({ aparelho: a })} active={(q.aparelho ?? "todos") === a}>
            {a === "todos" ? "Todos" : a === "celular" ? "Celular" : "Computador"}
          </Chip>
        ))}
      </nav>

      {data.total === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Ainda sem medições neste período. Elas chegam conforme as pessoas usam o site (só em produção).
        </p>
      ) : (
        <>
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {VITAL_NAMES.map((n) => (
              <OverallTile key={n} name={n} stat={data.overall[n]} />
            ))}
          </section>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Por página</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Página</th>
                  <th className="px-3 py-2 text-right font-medium">Visitas</th>
                  {VITAL_NAMES.map((n) => (
                    <th key={n} className="px-3 py-2 text-right font-medium" title={VITAL_LABEL[n]}>
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950/60 tabular-nums">
                {data.routes.map((r) => (
                  <tr key={r.route}>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-200">{r.route}</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{r.views}</td>
                    {VITAL_NAMES.map((n) => (
                      <Cell key={n} name={n} stat={r.stats[n]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Números em cinza têm menos de {MIN_SAMPLES} medições e ainda oscilam. Limites (bom / ruim):{" "}
            {VITAL_NAMES.map((n) => `${n} ${formatVital(n, VITAL_THRESHOLDS[n][0])} / ${formatVital(n, VITAL_THRESHOLDS[n][1])}`).join(" · ")}.
          </p>
        </>
      )}
    </main>
  );
}

function OverallTile({ name, stat }: { name: VitalName; stat?: VitalStat }) {
  const rating = stat ? rateVital(name, stat.p75) : null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
        {rating && <span className={`size-2 rounded-full ${DOT[rating]}`} aria-hidden />}
        {name}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${rating ? TONE[rating] : "text-zinc-600"}`}>{stat ? formatVital(name, stat.p75) : "—"}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{VITAL_LABEL[name]}</p>
    </div>
  );
}

function Cell({ name, stat }: { name: VitalName; stat?: VitalStat }) {
  if (!stat) return <td className="px-3 py-2 text-right text-zinc-700">—</td>;
  const rating = rateVital(name, stat.p75);
  const few = stat.n < MIN_SAMPLES;
  return (
    <td className={`px-3 py-2 text-right ${few ? "text-zinc-500" : TONE[rating]}`} title={`${stat.n} medições`}>
      {formatVital(name, stat.p75)}
    </td>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 ${active ? "bg-zinc-800 text-zinc-50" : "border border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
    >
      {children}
    </Link>
  );
}
