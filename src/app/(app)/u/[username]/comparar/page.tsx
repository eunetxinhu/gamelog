import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPlaytime } from "@/lib/format";
import { getProgression } from "@/lib/progression";
import { Avatar } from "@/components/avatar";
import { GameCover } from "@/components/game-cover";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Comparar com @${decodeURIComponent((await params).username)} · GameLog` };
}

const entrySelect = {
  gameId: true,
  playtimeMinutes: true,
  achievementsUnlocked: true,
  achievementsTotal: true,
  platinumAt: true,
  game: { select: { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } },
} as const;

/** Você x outro jogador: placar geral e os jogos em comum. */
export default async function ComparePage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/u/${username}/comparar`);

  const other = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true },
  });
  if (!other) notFound();
  if (other.id === viewer.id) redirect(`/u/${viewer.username}`);

  const [me, them, myLib, theirLib] = await Promise.all([
    getProgression(viewer.id),
    getProgression(other.id),
    prisma.libraryEntry.findMany({ where: { userId: viewer.id }, select: entrySelect }),
    prisma.libraryEntry.findMany({ where: { userId: other.id }, select: entrySelect }),
  ]);

  const theirs = new Map(theirLib.map((e) => [e.gameId, e]));
  const common = myLib
    .filter((e) => theirs.has(e.gameId))
    .map((mine) => ({ mine, theirs: theirs.get(mine.gameId)! }))
    .sort((a, b) => b.mine.playtimeMinutes + b.theirs.playtimeMinutes - (a.mine.playtimeMinutes + a.theirs.playtimeMinutes));

  const rows = [
    { label: "Nível", a: me.level.level, b: them.level.level },
    { label: "Platinas", a: me.stats.platinums, b: them.stats.platinums },
    { label: "Finalizados", a: me.stats.completed, b: them.stats.completed },
    { label: "Horas jogadas", a: me.stats.hours, b: them.stats.hours },
    { label: "Jogos", a: me.stats.games, b: them.stats.games },
    { label: "Reviews", a: me.stats.reviews, b: them.stats.reviews },
    { label: "Selos", a: me.badges.filter((x) => x.earned).length, b: them.badges.filter((x) => x.earned).length },
  ];
  const wins = rows.reduce((acc, r) => ({ a: acc.a + Number(r.a > r.b), b: acc.b + Number(r.b > r.a) }), { a: 0, b: 0 });

  const myName = viewer.displayName ?? viewer.username;
  const theirName = other.displayName ?? other.username;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/u/${other.username}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> {theirName}
      </Link>

      {/* ---- Placar --------------------------------------------------------- */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <Player name={myName} src={viewer.avatarUrl ?? viewer.steamAvatarUrl} wins={wins.a} lead={wins.a > wins.b} />
          <span className="text-sm font-bold text-zinc-500">VS</span>
          <Player name={theirName} src={other.avatarUrl ?? other.steamAvatarUrl} wins={wins.b} lead={wins.b > wins.a} />
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-800/80">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={`py-2 text-left tabular-nums ${r.a > r.b ? "font-bold text-emerald-400" : "text-zinc-300"}`}>{r.a.toLocaleString("pt-BR")}</td>
                <td className="py-2 text-center text-xs uppercase tracking-wide text-zinc-500">{r.label}</td>
                <td className={`py-2 text-right tabular-nums ${r.b > r.a ? "font-bold text-emerald-400" : "text-zinc-300"}`}>{r.b.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- Jogos em comum --------------------------------------------------- */}
      <h2 className="mb-3 mt-8 text-lg font-semibold text-zinc-50">
        Jogos em comum <span className="text-zinc-500">({common.length})</span>
      </h2>
      {common.length === 0 ? (
        <p className="text-sm text-zinc-500">Vocês ainda não têm jogos em comum na biblioteca.</p>
      ) : (
        <ul className="space-y-2">
          {common.slice(0, 60).map(({ mine, theirs: t }) => (
            <li key={mine.gameId} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <Link href={`/games/${mine.game.slug}`} className="w-10 shrink-0">
                <GameCover title={mine.game.title} coverUrl={mine.game.coverUrl} steamAppId={mine.game.steamAppId} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/games/${mine.game.slug}`} className="block truncate text-sm font-medium text-zinc-100 hover:underline">
                  {mine.game.title}
                </Link>
                <div className="mt-1 grid grid-cols-2 gap-3 text-xs">
                  <Side entry={mine} better={mine.playtimeMinutes > t.playtimeMinutes} align="left" />
                  <Side entry={t} better={t.playtimeMinutes > mine.playtimeMinutes} align="right" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Player({ name, src, wins, lead }: { name: string; src: string | null; wins: number; lead: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar name={name} src={src} size="md" />
      <span className="max-w-full truncate text-sm font-semibold text-zinc-100">{name}</span>
      <span className={`text-xs ${lead ? "font-bold text-emerald-400" : "text-zinc-500"}`}>
        {wins} {wins === 1 ? "vitória" : "vitórias"}
      </span>
    </div>
  );
}

function Side({
  entry,
  better,
  align,
}: {
  entry: { playtimeMinutes: number; achievementsUnlocked: number | null; achievementsTotal: number | null; platinumAt: Date | null };
  better: boolean;
  align: "left" | "right";
}) {
  const pct = entry.achievementsTotal ? Math.round(((entry.achievementsUnlocked ?? 0) / entry.achievementsTotal) * 100) : null;
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <span className={better ? "font-semibold text-emerald-400" : "text-zinc-400"}>{formatPlaytime(entry.playtimeMinutes)}</span>
      {entry.platinumAt ? (
        <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-300">
          <Trophy className="size-3" aria-hidden /> platinado
        </span>
      ) : (
        pct !== null && <span className="ml-1.5 text-zinc-500">{pct}% conquistas</span>
      )}
    </div>
  );
}
