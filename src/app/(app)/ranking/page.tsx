import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Medal, Trophy, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getProgression } from "@/lib/progression";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "Ranking" };

const BOARDS = {
  horas: { label: "Horas (2 semanas)", icon: Clock },
  platinas: { label: "Platinas do mês", icon: Trophy },
  nivel: { label: "Nível", icon: Zap },
} as const;
type Board = keyof typeof BOARDS;

/** Quantos jogadores entram no ranking global (o nível é calculado um a um). */
const GLOBAL_POOL = 60;

type Props = { searchParams: Promise<{ quadro?: string; escopo?: string }> };

export default async function RankingPage({ searchParams }: Props) {
  const query = await searchParams;
  const board: Board = query.quadro && query.quadro in BOARDS ? (query.quadro as Board) : "horas";
  const viewer = await getCurrentUser();

  const followingIds = viewer
    ? (await prisma.follow.findMany({ where: { followerId: viewer.id, status: "ACCEPTED" }, select: { followingId: true } })).map((f) => f.followingId)
    : [];
  const scope = viewer && query.escopo !== "global" ? "amigos" : "global";

  // Participantes: você + quem você segue, ou os jogadores mais ativos
  const ids =
    scope === "amigos"
      ? [viewer!.id, ...followingIds]
      : (
          await prisma.user.findMany({
            where: { bannedAt: null, isPrivate: false },
            orderBy: [{ library: { _count: "desc" } }, { activities: { _count: "desc" } }],
            take: GLOBAL_POOL,
            select: { id: true },
          })
        ).map((u) => u.id);

  const users = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true },
      })
    ).map((u) => [u.id, u]),
  );
  const scores = await scoreBoard(board, ids);
  const rows = ids
    .map((id) => ({ user: users.get(id)!, value: scores.get(id) ?? 0 }))
    .filter((r) => r.user && (r.value > 0 || r.user.id === viewer?.id))
    .sort((a, b) => b.value - a.value);

  const href = (q: Partial<{ quadro: string; escopo: string }>) =>
    `/ranking?${new URLSearchParams({ quadro: q.quadro ?? board, escopo: q.escopo ?? scope }).toString()}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-50">
        <Medal className="size-6 text-amber-400" aria-hidden /> Ranking
      </h1>
      <p className="mb-5 text-sm text-zinc-400">Quem está jogando mais, platinando mais e subindo de nível.</p>

      {viewer && (
        <nav className="mb-3 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1" aria-label="Quem entra no ranking">
          {(["amigos", "global"] as const).map((s) => (
            <Link
              key={s}
              href={href({ escopo: s })}
              aria-current={s === scope ? "page" : undefined}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${s === scope ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {s === "amigos" ? "Quem eu sigo" : "Global"}
            </Link>
          ))}
        </nav>
      )}

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Tipo de ranking">
        {(Object.keys(BOARDS) as Board[]).map((b) => {
          const Icon = BOARDS[b].icon;
          return (
            <Link
              key={b}
              href={href({ quadro: b })}
              aria-current={b === board ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                b === board ? "bg-zinc-100 font-medium text-zinc-900" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <Icon className="size-3.5" aria-hidden /> {BOARDS[b].label}
            </Link>
          );
        })}
      </nav>

      {scope === "amigos" && followingIds.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Você ainda não segue ninguém.{" "}
          <Link href="/explore" className="text-sky-400 hover:underline">
            Encontre jogadores no Explorar
          </Link>{" "}
          ou veja o{" "}
          <Link href={href({ escopo: "global" })} className="text-sky-400 hover:underline">
            ranking global
          </Link>
          .
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Ninguém pontuou ainda.</p>
      ) : (
        <ol className="divide-y divide-zinc-800/80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          {rows.map(({ user, value }, i) => {
            const name = user.displayName ?? user.username;
            const me = user.id === viewer?.id;
            return (
              <li key={user.id}>
                <Link href={`/u/${user.username}`} className={`flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-800/60 ${me ? "bg-sky-500/[0.07]" : ""}`}>
                  <span className={`w-7 text-center text-sm font-bold tabular-nums ${i < 3 ? ["text-amber-300", "text-zinc-300", "text-orange-400"][i] : "text-zinc-500"}`}>
                    {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                  </span>
                  <Avatar name={name} src={user.avatarUrl ?? user.steamAvatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-100">
                      {name} {me && <span className="text-xs text-sky-400">(você)</span>}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">@{user.username}</span>
                  </span>
                  <span className="text-right font-bold tabular-nums text-zinc-100">{formatValue(board, value)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}

function formatValue(board: Board, v: number) {
  if (board === "horas") return `${v.toLocaleString("pt-BR")} h`;
  if (board === "platinas") return `${v} 🏆`;
  return `Nv. ${v}`;
}

async function scoreBoard(board: Board, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  if (board === "horas") {
    const rows = await prisma.libraryEntry.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, playtime2WeeksMinutes: { gt: 0 } },
      _sum: { playtime2WeeksMinutes: true },
    });
    return new Map(rows.map((r) => [r.userId, Math.round((r._sum.playtime2WeeksMinutes ?? 0) / 60)]));
  }

  if (board === "platinas") {
    // Platinas com data neste mês (Steam + marcadas), uma por jogo
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const rows = await prisma.$queryRaw<{ user_id: string; n: bigint }[]>`
      SELECT user_id, count(DISTINCT game_id) AS n FROM (
        SELECT user_id, game_id FROM library_entries
          WHERE platinum_at >= ${monthStart} AND user_id = ANY(${ids}::uuid[])
        UNION
        SELECT user_id, game_id FROM game_logs
          WHERE status = 'PLATINUM' AND COALESCE(finished_at, updated_at) >= ${monthStart} AND user_id = ANY(${ids}::uuid[])
      ) t GROUP BY user_id`;
    return new Map(rows.map((r) => [r.user_id, Number(r.n)]));
  }

  const levels = await Promise.all(ids.map(async (id) => [id, (await getProgression(id)).level.level] as const));
  return new Map(levels);
}
