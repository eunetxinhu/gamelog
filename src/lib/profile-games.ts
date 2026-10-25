import "server-only";
import { prisma } from "@/lib/prisma";
import { formatPlaytime } from "@/lib/format";
import type { LogStatus } from "@/generated/prisma/enums";

/** Abas da página /u/[username]/jogos (o slug vai na URL: ?aba=platinas). */
export const PROFILE_TABS = [
  { slug: "biblioteca", label: "Biblioteca" },
  { slug: "jogando", label: "Jogando" },
  { slug: "finalizados", label: "Finalizados" },
  { slug: "platinas", label: "Platinas" },
  { slug: "dropados", label: "Dropados" },
  { slug: "backlog", label: "Backlog" },
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number]["slug"];

export function parseTab(value: string | undefined): ProfileTab {
  return PROFILE_TABS.some((t) => t.slug === value) ? (value as ProfileTab) : "biblioteca";
}

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;

export type ShelfGame = { id: string; slug: string; title: string; coverUrl: string | null; steamAppId: number | null };
export type ShelfItem = { game: ShelfGame; sub: string | null; rating: number | null; platinum: boolean };

const LOG_TAB_STATUS: Partial<Record<ProfileTab, LogStatus>> = {
  finalizados: "COMPLETED",
  dropados: "DROPPED",
  backlog: "BACKLOG",
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Platinas: marcadas no perfil + detectadas na Steam (inclusive Família), sem repetir o jogo.
 * Mais recentes primeiro.
 */
export async function getPlatinums(userId: string) {
  const [logs, steam] = await Promise.all([
    prisma.gameLog.findMany({
      where: { userId, status: "PLATINUM" },
      select: { updatedAt: true, finishedAt: true, rating: true, game: { select: gameSelect } },
    }),
    prisma.libraryEntry.findMany({
      where: { userId, platinumAt: { not: null } },
      select: { platinumAt: true, game: { select: gameSelect } },
    }),
  ]);
  const byGame = new Map<string, { game: ShelfGame; at: Date; rating: number | null }>();
  for (const s of steam) byGame.set(s.game.id, { game: s.game, at: s.platinumAt!, rating: null });
  for (const l of logs) {
    const prev = byGame.get(l.game.id);
    if (prev) prev.rating = l.rating;
    else byGame.set(l.game.id, { game: l.game, at: l.finishedAt ?? l.updatedAt, rating: l.rating });
  }
  return [...byGame.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** "Jogando": horas nas últimas 2 semanas na Steam + marcados como "Jogando". */
export async function getPlaying(userId: string, take?: number) {
  const [recent, logs] = await Promise.all([
    prisma.libraryEntry.findMany({
      where: { userId, playtime2WeeksMinutes: { gt: 0 } },
      orderBy: { playtime2WeeksMinutes: "desc" },
      take,
      select: { playtime2WeeksMinutes: true, game: { select: gameSelect } },
    }),
    prisma.gameLog.findMany({
      where: { userId, status: "PLAYING" },
      orderBy: { updatedAt: "desc" },
      take,
      select: { rating: true, game: { select: gameSelect } },
    }),
  ]);
  const byGame = new Map<string, ShelfItem>();
  for (const r of recent) {
    byGame.set(r.game.id, { game: r.game, sub: `${formatPlaytime(r.playtime2WeeksMinutes)} em 2 semanas`, rating: null, platinum: false });
  }
  for (const l of logs) {
    const prev = byGame.get(l.game.id);
    if (prev) prev.rating = l.rating;
    else byGame.set(l.game.id, { game: l.game, sub: "Jogando", rating: l.rating, platinum: false });
  }
  const items = [...byGame.values()];
  return take ? items.slice(0, take) : items;
}

/** Itens de uma aba. */
export async function getShelf(userId: string, tab: ProfileTab): Promise<ShelfItem[]> {
  if (tab === "platinas") {
    return (await getPlatinums(userId)).map((p) => ({ game: p.game, sub: dateFmt.format(p.at), rating: p.rating, platinum: true }));
  }
  if (tab === "jogando") return getPlaying(userId);

  if (tab === "biblioteca") {
    const entries = await prisma.libraryEntry.findMany({
      where: { userId },
      orderBy: [{ playtimeMinutes: "desc" }, { game: { title: "asc" } }],
      take: 1000,
      select: {
        source: true,
        playtimeMinutes: true,
        achievementsUnlocked: true,
        achievementsTotal: true,
        platinumAt: true,
        game: { select: gameSelect },
      },
    });
    return entries.map((e) => ({
      game: e.game,
      sub:
        [
          e.playtimeMinutes > 0 ? formatPlaytime(e.playtimeMinutes) : null,
          e.achievementsTotal ? `${e.achievementsUnlocked ?? 0}/${e.achievementsTotal} 🏅` : null,
          e.source === "FAMILY" ? "Família" : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      rating: null,
      platinum: Boolean(e.platinumAt),
    }));
  }

  const logs = await prisma.gameLog.findMany({
    where: { userId, status: LOG_TAB_STATUS[tab] },
    orderBy: { updatedAt: "desc" },
    take: 1000,
    select: { rating: true, finishedAt: true, updatedAt: true, game: { select: gameSelect } },
  });
  return logs.map((l) => ({
    game: l.game,
    sub: tab === "finalizados" ? dateFmt.format(l.finishedAt ?? l.updatedAt) : null,
    rating: l.rating,
    platinum: false,
  }));
}

/** Quantidade de cada aba (os mesmos critérios de getShelf). */
export async function getShelfCounts(userId: string): Promise<Record<ProfileTab, number>> {
  const [library, playing, platinums, byStatus] = await Promise.all([
    prisma.libraryEntry.count({ where: { userId } }),
    getPlaying(userId).then((p) => p.length),
    getPlatinums(userId).then((p) => p.length),
    prisma.gameLog.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
  ]);
  const status = (s: LogStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    biblioteca: library,
    jogando: playing,
    finalizados: status("COMPLETED"),
    platinas: platinums,
    dropados: status("DROPPED"),
    backlog: status("BACKLOG"),
  };
}
