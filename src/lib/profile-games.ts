import "server-only";
import { prisma } from "@/lib/prisma";
import { formatPlaytime } from "@/lib/format";
import type { LogStatus } from "@/generated/prisma/enums";
import { ensurePlatinumRarity, formatRarity } from "@/lib/rarity";
import { MIN_ACHIEVEMENTS_FOR_PLATINUM } from "@/lib/steam/sync";

/** Abas da página /u/[username]/jogos (o slug vai na URL: ?aba=platinas). */
export const PROFILE_TABS = [
  { slug: "biblioteca", label: "Biblioteca" },
  { slug: "jogando", label: "Jogando" },
  { slug: "finalizados", label: "Finalizados" },
  { slug: "platinas", label: "Platinas" },
  { slug: "quase", label: "Quase lá" },
  { slug: "dropados", label: "Dropados" },
  { slug: "backlog", label: "Backlog" },
  { slug: "wishlist", label: "Quero jogar" },
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number]["slug"];

export function parseTab(value: string | undefined): ProfileTab {
  return PROFILE_TABS.some((t) => t.slug === value) ? (value as ProfileTab) : "biblioteca";
}

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;
const platinumGameSelect = { ...gameSelect, platinumRarity: true, platinumRarityCheckedAt: true } as const;

/** "Quase lá": pelo menos essa fração das conquistas, sem ter platinado. */
export const NEAR_PLATINUM_RATIO = 0.8;

export type ShelfGame = { id: string; slug: string; title: string; coverUrl: string | null; steamAppId: number | null };
export type ShelfItem = {
  game: ShelfGame;
  sub: string | null;
  rating: number | null;
  platinum: boolean;
  /** % de jogadores com a platina (só nas platinas) */
  rarity?: number | null;
};

const LOG_TAB_STATUS: Partial<Record<ProfileTab, LogStatus>> = {
  dropados: "DROPPED",
  backlog: "BACKLOG",
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Platinas: marcadas no perfil + detectadas na Steam (inclusive Família), sem repetir o jogo.
 * Mais recentes primeiro, com a raridade (calculada na hora para jogos que ainda não têm).
 */
export async function getPlatinums(userId: string) {
  const [logs, steam] = await Promise.all([
    prisma.gameLog.findMany({
      where: { userId, status: "PLATINUM" },
      select: { updatedAt: true, finishedAt: true, rating: true, game: { select: platinumGameSelect } },
    }),
    prisma.libraryEntry.findMany({
      where: { userId, platinumAt: { not: null } },
      select: { platinumAt: true, game: { select: platinumGameSelect } },
    }),
  ]);
  type Row = (typeof steam)[number]["game"];
  const byGame = new Map<string, { game: Row; at: Date; rating: number | null }>();
  for (const s of steam) byGame.set(s.game.id, { game: s.game, at: s.platinumAt!, rating: null });
  for (const l of logs) {
    const prev = byGame.get(l.game.id);
    if (prev) prev.rating = l.rating;
    else byGame.set(l.game.id, { game: l.game, at: l.finishedAt ?? l.updatedAt, rating: l.rating });
  }
  const list = [...byGame.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
  const rarity = await ensurePlatinumRarity(list.map((p) => p.game));

  return list.map(({ game, at, rating }) => ({
    game: { id: game.id, slug: game.slug, title: game.title, coverUrl: game.coverUrl, steamAppId: game.steamAppId },
    at,
    rating,
    rarity: rarity.get(game.id) ?? null,
  }));
}

/** Jogos com quase todas as conquistas, do que falta menos para o que falta mais. */
export async function getNearPlatinum(userId: string, take?: number): Promise<ShelfItem[]> {
  const entries = await prisma.libraryEntry.findMany({
    where: { userId, platinumAt: null, achievementsTotal: { gte: MIN_ACHIEVEMENTS_FOR_PLATINUM }, achievementsUnlocked: { gt: 0 } },
    select: { achievementsUnlocked: true, achievementsTotal: true, game: { select: gameSelect } },
  });
  const items = entries
    .map((e) => ({ ...e, unlocked: e.achievementsUnlocked!, total: e.achievementsTotal! }))
    .filter((e) => e.unlocked < e.total && e.unlocked / e.total >= NEAR_PLATINUM_RATIO)
    .sort((a, b) => a.total - a.unlocked - (b.total - b.unlocked) || b.unlocked / b.total - a.unlocked / a.total)
    .map((e) => {
      const missing = e.total - e.unlocked;
      return {
        game: e.game,
        sub: `falta${missing > 1 ? "m" : ""} ${missing} · ${e.unlocked}/${e.total}`,
        rating: null,
        platinum: false,
      };
    });
  return take ? items.slice(0, take) : items;
}

/**
 * Finalizados = marcados como "Finalizado" + todas as platinas (platinar implica
 * ter terminado). O contrário não vale: finalizar não conta como platina.
 */
export async function getCompleted(userId: string) {
  const [logs, platinums] = await Promise.all([
    prisma.gameLog.findMany({
      where: { userId, status: "COMPLETED" },
      select: { finishedAt: true, updatedAt: true, rating: true, game: { select: gameSelect } },
    }),
    getPlatinums(userId),
  ]);
  const byGame = new Map<string, { game: ShelfGame; at: Date; rating: number | null; platinum: boolean; rarity: number | null }>();
  for (const l of logs) byGame.set(l.game.id, { game: l.game, at: l.finishedAt ?? l.updatedAt, rating: l.rating, platinum: false, rarity: null });
  for (const p of platinums) byGame.set(p.game.id, { game: p.game, at: p.at, rating: p.rating ?? byGame.get(p.game.id)?.rating ?? null, platinum: true, rarity: p.rarity });
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
    return (await getPlatinums(userId)).map((p) => ({
      game: p.game,
      sub: [dateFmt.format(p.at), p.rarity !== null ? `${formatRarity(p.rarity)} dos jogadores` : null].filter(Boolean).join(" · "),
      rating: p.rating,
      platinum: true,
      rarity: p.rarity,
    }));
  }
  if (tab === "jogando") return getPlaying(userId);
  if (tab === "quase") return getNearPlatinum(userId);
  if (tab === "wishlist") {
    const items = await prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { game: { select: { ...gameSelect, priceFinal: true, discountPercent: true } } },
    });
    return items.map(({ game: { priceFinal, discountPercent, ...game } }) => ({
      game,
      sub: discountPercent ? `-${discountPercent}% · ${brl.format((priceFinal ?? 0) / 100)}` : priceFinal ? brl.format(priceFinal / 100) : null,
      rating: null,
      platinum: false,
    }));
  }
  if (tab === "finalizados") {
    return (await getCompleted(userId)).map((c) => ({
      game: c.game,
      sub: c.platinum ? `${dateFmt.format(c.at)} · platinado` : dateFmt.format(c.at),
      rating: c.rating,
      platinum: c.platinum,
      rarity: c.rarity,
    }));
  }

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
  return logs.map((l) => ({ game: l.game, sub: null, rating: l.rating, platinum: false }));
}

/** Quantidade de cada aba (os mesmos critérios de getShelf). */
export async function getShelfCounts(userId: string): Promise<Record<ProfileTab, number>> {
  const [library, playing, completed, near, wishlist, byStatus] = await Promise.all([
    prisma.libraryEntry.count({ where: { userId } }),
    getPlaying(userId).then((p) => p.length),
    getCompleted(userId),
    getNearPlatinum(userId).then((p) => p.length),
    prisma.wishlistItem.count({ where: { userId } }),
    prisma.gameLog.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
  ]);
  const status = (s: LogStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    biblioteca: library,
    jogando: playing,
    finalizados: completed.length,
    platinas: completed.filter((c) => c.platinum).length,
    quase: near,
    dropados: status("DROPPED"),
    backlog: status("BACKLOG"),
    wishlist,
  };
}
