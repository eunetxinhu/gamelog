import { Palette, Star } from "lucide-react";

type Taste = {
  genres: { genre: string; share: number }[];
  ratings: number;
  myAverage: number | null;
  communityAverage: number | null;
  stricterThan: number | null;
};

const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Gêneros favoritos (pelas horas) e como a pessoa avalia comparada com a comunidade. */
export function TasteSection({ taste, isMe }: { taste: Taste; isMe: boolean }) {
  const diff = taste.myAverage !== null && taste.communityAverage !== null ? taste.myAverage - taste.communityAverage : null;
  return (
    <section className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2">
      {taste.genres.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            <Palette className="size-4 text-brand-400" aria-hidden /> Gêneros favoritos
          </h2>
          <ul className="space-y-2">
            {taste.genres.map((g) => (
              <li key={g.genre}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-zinc-200">{g.genre}</span>
                  <span className="tabular-nums text-zinc-500">{Math.round(g.share * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${Math.max(4, g.share * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">Pelas horas jogadas na Steam e pelos jogos registrados.</p>
        </div>
      )}

      {taste.myAverage !== null && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> Como {isMe ? "você avalia" : "avalia"}
          </h2>
          <div className="flex items-end gap-6">
            <div>
              <p className="text-3xl font-extrabold tabular-nums text-zinc-50">{num(taste.myAverage)}</p>
              <p className="text-xs text-zinc-500">nota média ({taste.ratings} {taste.ratings === 1 ? "nota" : "notas"})</p>
            </div>
            {taste.communityAverage !== null && (
              <div>
                <p className="text-xl font-bold tabular-nums text-zinc-400">{num(taste.communityAverage)}</p>
                <p className="text-xs text-zinc-500">média da comunidade</p>
              </div>
            )}
          </div>
          {diff !== null && (
            <p className="mt-3 text-sm text-zinc-300">
              {Math.abs(diff) < 0.15
                ? "Dá notas bem na média da comunidade."
                : diff > 0
                  ? `Dá notas ${num(diff)} acima da média: é generoso(a).`
                  : `Dá notas ${num(-diff)} abaixo da média: é exigente.`}
              {taste.stricterThan !== null && taste.stricterThan > 0 && (
                <span className="text-zinc-400"> Mais exigente que {taste.stricterThan}% dos jogadores.</span>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
