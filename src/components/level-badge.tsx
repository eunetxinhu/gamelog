import type { LevelInfo } from "@/lib/progression";

/** Chip "Nv. 12" com a barra de XP até o próximo nível. */
export function LevelBadge({ level, compact }: { level: LevelInfo; compact?: boolean }) {
  const pct = Math.round(level.progress * 100);
  if (compact) {
    return (
      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-600 to-violet-600 px-2 py-0.5 text-[11px] font-bold text-white" title={`${level.xp.toLocaleString("pt-BR")} XP`}>
        Nv. {level.level}
      </span>
    );
  }
  return (
    <div className="w-full max-w-56">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="rounded-full bg-gradient-to-r from-sky-600 to-violet-600 px-2 py-0.5 font-bold text-white">Nv. {level.level}</span>
        <span className="tabular-nums text-zinc-400">
          {level.xp.toLocaleString("pt-BR")} / {level.next.toLocaleString("pt-BR")} XP
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="XP até o próximo nível">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
