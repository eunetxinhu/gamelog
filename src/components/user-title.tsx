import { Crown } from "lucide-react";

/**
 * Título especial ao lado do nome (ex.: "Fundador & CEO"). Visual exclusivo: dourado
 * com brilho, para não se confundir com os selos que qualquer pessoa conquista.
 * `compact`: só a coroa (no feed, onde a linha é curta); o título vai no tooltip.
 */
export function UserTitle({ title, compact = false }: { title: string | null | undefined; compact?: boolean }) {
  if (!title) return null;
  if (compact) {
    return (
      <span title={title} className="ml-1 inline-flex translate-y-[-1px] align-middle text-amber-300">
        <Crown className="size-3.5 fill-amber-300/30" aria-hidden />
        <span className="sr-only">{title}</span>
      </span>
    );
  }
  return (
    <span className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950 shadow-[0_0_18px_-2px_rgba(251,191,36,0.55)] ring-1 ring-amber-200/70">
      <Crown className="size-3.5 fill-amber-950/20" aria-hidden />
      {title}
      {/* reflexo passando de tempos em tempos (respeita "reduzir movimento") */}
      <span aria-hidden className="title-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-white/50 blur-[2px] motion-reduce:hidden" />
    </span>
  );
}
