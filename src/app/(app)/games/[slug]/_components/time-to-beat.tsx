import { Hourglass } from "lucide-react";
import { formatEstimate, MIN_COMMUNITY_SAMPLE } from "@/lib/time-to-beat-calc";
import type { GameTimes } from "@/lib/time-to-beat";

type Props = {
  times: GameTimes;
  /** Minutos que o visitante já jogou (Steam), se tiver o jogo */
  myMinutes: number | null;
  /** O visitante já terminou? (aí não mostra "faltam") */
  finished: boolean;
};

/**
 * "Tempo para zerar" na página do jogo. Só aparece quando há algum dado.
 * Comunidade = mediana das horas na Steam de quem finalizou/platinou no Poneglyph.gg.
 */
export function TimeToBeat({ times, myMinutes, finished }: Props) {
  const { community, rawgHours, estimate } = times;
  const finish = community && community.finishMedian && community.finishCount >= MIN_COMMUNITY_SAMPLE ? community : null;
  const platinum = community && community.platinumMedian && community.platinumCount >= MIN_COMMUNITY_SAMPLE ? community : null;
  if (!finish && !platinum && !rawgHours) return null;

  const remaining = estimate && myMinutes && !finished ? estimate.minutes - myMinutes : null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5" aria-labelledby="ttb-title">
      <h2 id="ttb-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <Hourglass className="size-4 text-violet-300" aria-hidden /> Tempo para zerar
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {finish && (
          <Item label="Para finalizar" value={formatEstimate(finish.finishMedian!)} hint={`${finish.finishCount} jogadores do Poneglyph.gg`} />
        )}
        {platinum && (
          <Item label="Para platinar" value={formatEstimate(platinum.platinumMedian!)} hint={`${platinum.platinumCount} platinas no Poneglyph.gg`} gold />
        )}
        {rawgHours ? <Item label="Média na Steam" value={formatEstimate(rawgHours * 60)} hint="todos os jogadores · RAWG" /> : null}
      </dl>
      {myMinutes !== null && myMinutes > 0 && (
        <p className="mt-3 text-xs text-zinc-400">
          Você jogou {formatEstimate(myMinutes).replace("~", "")}
          {remaining !== null && remaining > 30 && <> · faltam {formatEstimate(remaining)} pela estimativa</>}
          .
        </p>
      )}
    </section>
  );
}

function Item({ label, value, hint, gold }: { label: string; value: string; hint: string; gold?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`text-xl font-bold ${gold ? "text-amber-300" : "text-zinc-50"}`}>{value}</dd>
      <dd className="text-[11px] text-zinc-500">{hint}</dd>
    </div>
  );
}
