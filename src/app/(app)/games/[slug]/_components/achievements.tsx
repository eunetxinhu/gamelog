import type { ReactNode } from "react";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { Gem, Lock, Trophy } from "lucide-react";
import { getAchievementDetails, type AchievementDetail } from "@/lib/steam/api";
import { relativeTime } from "@/lib/format";

/** Abaixo disso a conquista ganha o selo de "rara". */
const RARE_PERCENT = 5;

/**
 * `steamId` = Steam do visitante logado (null = mostra só a raridade).
 * `owner` = quem está vendo, para guardar o progresso atualizado na biblioteca dele.
 */
type Props = { appId: number; steamId: string | null; owner?: { userId: string; gameId: string } | null };

/**
 * Conquistas do jogo (Server Component, carregado em <Suspense> na página do jogo).
 * Com Steam vinculada: progresso, o que falta (mais fáceis primeiro) e as mais raras que você tem.
 * Sem Steam: as conquistas mais raras do jogo.
 */
export async function Achievements({ appId, steamId, owner }: Props) {
  const list = await getAchievementDetails(appId, steamId);
  if (!list) return null;

  const total = list.length;
  const unlocked = list.filter((a) => a.achieved);
  const hasProgress = steamId !== null && unlocked.length > 0;
  const byRarity = (a: AchievementDetail, b: AchievementDetail) => (a.percent ?? 100) - (b.percent ?? 100);
  // A mais rara do jogo dá o teto de quantos jogadores podem ter a platina
  const hardest = [...list].sort(byRarity)[0];

  if (!hasProgress) {
    return (
      <Section total={total} hardest={hardest}>
        <h3 className="mb-2 text-sm font-medium text-zinc-400">Mais raras</h3>
        <List items={[...list].sort(byRarity).slice(0, 6)} showLocked={false} />
      </Section>
    );
  }

  // O progresso acabou de vir da Steam: atualiza a biblioteca (aba Conquistas do perfil)
  // sem esperar a próxima sincronização. Só quem tem o jogo na biblioteca (updateMany = 0 linhas se não tiver).
  if (owner) {
    const counts = { achievementsUnlocked: unlocked.length, achievementsTotal: total };
    after(() =>
      prisma.libraryEntry
        .updateMany({ where: { userId: owner.userId, gameId: owner.gameId }, data: counts })
        .then(() => undefined, () => undefined),
    );
  }

  const pct = Math.floor((unlocked.length / total) * 100);
  const missing = list.filter((a) => !a.achieved).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  const rarestMine = [...unlocked].sort(byRarity).slice(0, 4);
  const platinum = missing.length === 0;

  return (
    <Section total={total} hardest={hardest}>
      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium text-zinc-200">
            {platinum ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                <Trophy className="size-4" aria-hidden /> Platinado!
              </span>
            ) : (
              "Seu progresso"
            )}
          </span>
          <span className="text-zinc-400">
            {unlocked.length}/{total} · {pct}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${platinum ? "bg-amber-400" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {missing.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-400">Faltam {missing.length} · mais fáceis primeiro</h3>
            <List items={missing.slice(0, 8)} showLocked />
          </div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Suas mais raras</h3>
          <List items={rarestMine} showLocked={false} />
        </div>
      </div>
    </Section>
  );
}

function Section({ total, hardest, children }: { total: number; hardest: AchievementDetail; children: ReactNode }) {
  return (
    <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-50">Conquistas</h2>
        <p className="text-xs text-zinc-500">
          {total} no total
          {hardest.percent !== null && (
            <>
              {" "}· platina: no máximo <strong className="text-amber-300">{formatPercent(hardest.percent)}</strong> dos jogadores
            </>
          )}
        </p>
      </header>
      {children}
    </section>
  );
}

function List({ items, showLocked }: { items: AchievementDetail[]; showLocked: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((a) => {
        const secret = showLocked && a.hidden && !a.achieved;
        const rare = a.percent !== null && a.percent < RARE_PERCENT;
        return (
          <li key={a.apiName} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.achieved || !showLocked ? a.icon : a.iconGray} alt="" loading="lazy" className="size-10 shrink-0 rounded-md ring-1 ring-white/10" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-100">
                {secret ? (
                  <>
                    <Lock className="size-3.5 text-zinc-500" aria-hidden /> Conquista secreta
                  </>
                ) : (
                  a.name
                )}
                {rare && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">
                    <Gem className="size-2.5" aria-hidden /> RARA
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {secret ? "Descubra jogando" : (a.description ?? "")}
                {a.achieved && a.unlockedAt && ` · ${relativeTime(a.unlockedAt)}`}
              </p>
            </div>
            {a.percent !== null && <span className="shrink-0 text-xs tabular-nums text-zinc-400">{formatPercent(a.percent)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function formatPercent(n: number) {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 ? 1 : 0 })}%`;
}
