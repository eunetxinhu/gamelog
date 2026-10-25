import { SCORE_BG, SCORE_TEXT, scoreInfo } from "@/lib/score";

type Props = {
  /** 0–100; null = ainda sem notas suficientes ("a definir") */
  score: number | null;
  /** Ex.: "Nota GameLog", "Metascore" */
  title: string;
  /** Linha de baixo (ex.: "12 notas") */
  caption?: string;
  href?: string | null;
  size?: "sm" | "lg";
};

/** Quadrado colorido com a nota, no estilo da Metacritic. */
export function ScoreBadge({ score, title, caption, href, size = "lg" }: Props) {
  const info = score !== null ? scoreInfo(score) : null;
  const box = size === "lg" ? "size-16 text-3xl rounded-xl" : "size-9 text-base rounded-lg";

  const content = (
    <div className="flex items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center font-extrabold tabular-nums ${box} ${
          info ? SCORE_BG[info.tone] : "border border-dashed border-zinc-600 text-sm text-zinc-500"
        }`}
      >
        {score ?? "—"}
      </span>
      {size === "lg" && (
        <span className="min-w-0">
          <span className="block text-xs uppercase tracking-wide text-zinc-500">{title}</span>
          <span className={`block font-semibold ${info ? SCORE_TEXT[info.tone] : "text-zinc-400"}`}>{info?.label ?? "A definir"}</span>
          {caption && <span className="block text-xs text-zinc-500">{caption}</span>}
        </span>
      )}
    </div>
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-xl transition hover:opacity-90" title={`${title} (abre em nova aba)`}>
      {content}
    </a>
  ) : (
    content
  );
}
