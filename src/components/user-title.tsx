import type { AwardStyle, AwardSymbol, UserTitleData } from "@/lib/awards";
import { AwardIcon } from "./award-icon";

/** Visual de cada estilo: o selo inteiro (pill) e a cor do símbolo sozinho. */
export const AWARD_LOOK: Record<AwardStyle, { pill: string; shine: string; icon: string }> = {
  gold: {
    pill: "bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 text-amber-950 ring-amber-200/70 shadow-[0_0_18px_-2px_rgba(251,191,36,0.55)]",
    shine: "bg-white/50",
    icon: "text-amber-300",
  },
  crimson: {
    pill: "bg-gradient-to-r from-brand-800 via-brand-500 to-brand-800 text-white ring-brand-300/60 shadow-[0_0_18px_-2px_rgba(239,51,64,0.6)]",
    shine: "bg-white/35",
    icon: "text-brand-400",
  },
  silver: {
    pill: "bg-gradient-to-r from-zinc-300 via-white to-zinc-400 text-zinc-900 ring-white/70 shadow-[0_0_18px_-2px_rgba(255,255,255,0.45)]",
    shine: "bg-white/70",
    icon: "text-zinc-200",
  },
  obsidian: {
    pill: "bg-gradient-to-r from-black via-zinc-900 to-black text-brand-300 ring-brand-500/70 shadow-[0_0_18px_-2px_rgba(212,27,38,0.55)]",
    shine: "bg-brand-400/25",
    icon: "text-brand-500",
  },
};

/**
 * Título especial ao lado do nome (ex.: "Fundador & CEO"), dado pela moderação.
 * `compact`: só o símbolo (no feed, onde a linha é curta); o título vai no tooltip.
 */
export function UserTitle({ title, compact = false }: { title: UserTitleData | undefined; compact?: boolean }) {
  if (!title) return null;
  const look = AWARD_LOOK[title.style];
  if (compact) {
    return (
      <span title={title.text} className={`ml-1 inline-flex translate-y-[-1px] align-middle ${look.icon}`}>
        <AwardIcon icon={title.icon} className="size-3.5" />
        <span className="sr-only">{title.text}</span>
      </span>
    );
  }
  return <AwardPill text={title.text} icon={title.icon} style={title.style} />;
}

/** O selo em si (usado pelo título e pelos selos exclusivos). */
export function AwardPill({ text, icon, style, size = "sm" }: { text: string; icon: AwardSymbol; style: AwardStyle; size?: "sm" | "xs" }) {
  const look = AWARD_LOOK[style];
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r font-bold uppercase tracking-wide ring-1 ${look.pill} ${
        size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <AwardIcon icon={icon} className={size === "xs" ? "size-3" : "size-3.5"} />
      {text}
      {/* reflexo passando de tempos em tempos (respeita "reduzir movimento") */}
      <span aria-hidden className={`title-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] blur-[2px] motion-reduce:hidden ${look.shine}`} />
    </span>
  );
}
