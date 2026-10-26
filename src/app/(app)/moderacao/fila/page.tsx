import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Clock, Layers, Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getQueueOverview } from "@/lib/jobs/admin";
import { STEP_LABEL } from "@/lib/jobs/sync-plan";
import { relativeTime } from "@/lib/format";
import { AutoRefresh, RetryTaskButton, RetryUserButton, RunQueueButton } from "./queue-buttons";

export const metadata: Metadata = { title: "Fila de sincronização" };

const TRIGGER_LABEL: Record<string, string> = { MANUAL: "botão", AUTO: "automática", CRON: "cron" };
const secs = (s: number | null) => (s === null ? "—" : s < 60 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1).replace(".", ",")} min`);

/** Saúde da fila de sincronização da Steam. Só administradores. */
export default async function QueuePage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const q = await getQueueOverview();
  const busy = q.last24h.active > 0 || q.running.length > 0;
  const stuck = q.running.filter((r) => r.stuck).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <AutoRefresh seconds={8} active={busy} />
      <Link href="/moderacao" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> Moderação
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-50">
            <Layers className="size-6 text-brand-400" aria-hidden /> Fila de sincronização
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Sincronizações da Steam nas últimas 24 h. {busy && "Atualizando sozinho enquanto tem coisa rodando."}</p>
        </div>
        <RunQueueButton />
      </div>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Concluídas" value={q.last24h.done} tone="good" />
        <Tile label="Falharam" value={q.last24h.failed} tone={q.last24h.failed ? "bad" : "neutral"} />
        <Tile label="Rodando agora" value={q.last24h.active} hint={q.ready ? `${q.ready} tarefa(s) pronta(s)` : undefined} />
        <Tile label="Duração" value={secs(q.last24h.p50s)} hint={`95% em até ${secs(q.last24h.p95s)}`} />
      </section>
      <p className="-mt-5 mb-8 text-xs text-zinc-500">
        Origem: {Object.entries(q.last24h.byTrigger).map(([t, n]) => `${n} ${TRIGGER_LABEL[t] ?? t}`).join(" · ") || "nenhuma ainda"}
      </p>

      {(stuck > 0 || q.overdue > 0) && (
        <div role="alert" className="mb-8 space-y-1 rounded-xl border border-amber-600/50 bg-amber-500/10 p-4 text-sm text-amber-100">
          {stuck > 0 && <p>⚠️ {stuck} tarefa(s) rodando há mais de 3 min: o worker deve ter caído. Elas voltam para a fila sozinhas no próximo worker.</p>}
          {q.overdue > 0 && <p>⚠️ {q.overdue} pessoa(s) com a sincronização atrasada há mais de 2 h. Confira se o cron do GitHub Actions está rodando.</p>}
        </div>
      )}

      <Section title="Etapas (24 h)">
        {q.steps.length === 0 ? (
          <Empty>Nenhuma tarefa nas últimas 24 h.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 text-right font-medium">Ok</th>
                  <th className="px-3 py-2 text-right font-medium">Falhou</th>
                  <th className="px-3 py-2 text-right font-medium">Pulou</th>
                  <th className="px-3 py-2 text-right font-medium">Com nova tentativa</th>
                  <th className="px-3 py-2 text-right font-medium">Tempo médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950/60 tabular-nums">
                {q.steps.map((s) => (
                  <tr key={s.step}>
                    <td className="px-3 py-2 text-zinc-200">{s.label}</td>
                    <td className="px-3 py-2 text-right text-emerald-300">{s.done}</td>
                    <td className={`px-3 py-2 text-right ${s.failed ? "text-red-300" : "text-zinc-500"}`}>{s.failed}</td>
                    <td className="px-3 py-2 text-right text-zinc-500">{s.skipped}</td>
                    <td className={`px-3 py-2 text-right ${s.retried ? "text-amber-300" : "text-zinc-500"}`}>{s.retried}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{secs(s.avg_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {q.running.length > 0 && (
        <Section title="Rodando agora">
          <ul className="space-y-2">
            {q.running.map((r) => (
              <Row key={r.id}>
                <Loader2 className={`size-4 shrink-0 ${r.stuck ? "text-amber-400" : "animate-spin text-brand-400"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  @{r.job.user.username} · {STEP_LABEL[r.step]}
                  <span className="text-zinc-500"> · desde {r.lockedAt ? relativeTime(r.lockedAt) : "agora"}</span>
                  {r.stuck && <span className="text-amber-300"> · parece travada</span>}
                </span>
              </Row>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Esperando nova tentativa">
        {q.retrying.length === 0 ? (
          <Empty>Nada esperando. A Steam está respondendo.</Empty>
        ) : (
          <ul className="space-y-2">
            {q.retrying.map((t) => (
              <Row key={t.id}>
                <Clock className="size-4 shrink-0 text-amber-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="text-zinc-200">
                    @{t.job.user.username} · {STEP_LABEL[t.step]} · tentativa {t.attempts + 1} de 3
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {t.error ?? "sem detalhe"} · às {t.runAfter.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <RetryTaskButton taskId={t.id} />
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Falhas (7 dias)">
        {q.failed.length === 0 ? (
          <Empty>Nenhuma falha. 🌊</Empty>
        ) : (
          <ul className="space-y-2">
            {q.failed.map((f) => (
              <Row key={f.id}>
                <AlertTriangle className={`size-4 shrink-0 ${f.error?.code === "STEAM_PRIVATE" ? "text-zinc-500" : "text-red-400"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="text-zinc-200">
                    @{f.user.username} <span className="text-zinc-500">· {TRIGGER_LABEL[f.trigger] ?? f.trigger} · {relativeTime(f.createdAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    <code className="text-zinc-400">{f.error?.code ?? "?"}</code> {f.error?.message}
                  </span>
                </span>
                <RetryUserButton userId={f.user.id} />
              </Row>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-zinc-500">Perfil privado (cinza) depende da pessoa. As outras falhas também chegam como alerta em Erros do site.</p>
      </Section>
    </main>
  );
}

function Tile({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-zinc-50";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm">{children}</li>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-center text-sm text-zinc-500">{children}</p>;
}
