import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { compatibilityLabel, MIN_COMMON } from "@/lib/taste";
import { GameCover } from "./game-cover";

type G = { id: string; slug: string; title: string; coverUrl: string | null; steamAppId: number | null };
type Data = { score: number | null; common: number; loved: G[]; split: G[] };

/** Cor da compatibilidade: vermelho forte quando alta, neutro quando baixa. */
const tone = (score: number) => (score >= 70 ? "text-brand-300 ring-brand-500/50 bg-brand-500/15" : score >= 50 ? "text-zinc-100 ring-zinc-600 bg-zinc-800/80" : "text-zinc-400 ring-zinc-700 bg-zinc-900/80");

/** Selo curto no perfil: "78% compatível". */
export function CompatChip({ score, href }: { score: number; href: string }) {
  return (
    <Link
      href={href}
      title={`${compatibilityLabel(score)}: compatibilidade pelas notas em comum`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 transition hover:brightness-125 ${tone(score)}`}
    >
      <HeartHandshake className="size-3.5" aria-hidden /> {score}% compatível
    </Link>
  );
}

/** Seção da página Comparar: a porcentagem, os jogos que os dois amam e onde discordam. */
export function CompatSection({ data, otherName }: { data: Data; otherName: string }) {
  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-zinc-50">
        <HeartHandshake className="size-5 text-brand-400" aria-hidden /> Compatibilidade de gosto
      </h2>
      {data.score === null ? (
        <p className="text-sm text-zinc-400">
          Vocês avaliaram {data.common} {data.common === 1 ? "jogo" : "jogos"} em comum. Com {MIN_COMMON} ou mais, aparece a porcentagem.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div
              className="grid size-20 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--color-brand-500) ${data.score * 3.6}deg, rgb(39 39 42) 0deg)` }}
              aria-hidden
            >
              <div className="grid size-16 place-items-center rounded-full bg-zinc-950 text-lg font-extrabold text-zinc-50">{data.score}%</div>
            </div>
            <div>
              <p className="text-lg font-bold text-zinc-50">{compatibilityLabel(data.score)}</p>
              <p className="text-sm text-zinc-400">
                Pelas notas de {data.common} jogos que você e {otherName} avaliaram.
              </p>
            </div>
          </div>
          <Covers title="Os dois amam" games={data.loved} />
          <Covers title="Onde vocês discordam" games={data.split} />
        </>
      )}
    </section>
  );
}

function Covers({ title, games }: { title: string; games: G[] }) {
  if (games.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="grid grid-cols-6 gap-2">
        {games.map((g) => (
          <li key={g.id}>
            <Link href={`/games/${g.slug}`} title={g.title}>
              <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
