import "server-only";
import { prisma } from "@/lib/prisma";
import { getCompleted } from "@/lib/profile-games";
import { RARE_PERCENT } from "@/lib/rarity";

// =============================================================================
//  Estatísticas, XP, nível e selos. Tudo calculado na hora a partir dos dados
//  (nada guardado), então muda sozinho quando a pessoa joga, platina ou escreve.
// =============================================================================

export type UserStats = {
  games: number;
  hours: number;
  hours2Weeks: number;
  platinums: number;
  rarePlatinums: number;
  completed: number; // inclui as platinas
  reviews: number;
  followers: number;
  following: number;
  familyGames: number;
  accountDays: number;
  invites: number;
};

export async function getUserStats(userId: string): Promise<UserStats> {
  const [user, library, family, completed, reviews] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true, _count: { select: { followers: { where: { status: "ACCEPTED" } }, following: { where: { status: "ACCEPTED" } }, invitees: true } } },
    }),
    prisma.libraryEntry.aggregate({ where: { userId }, _count: { _all: true }, _sum: { playtimeMinutes: true, playtime2WeeksMinutes: true } }),
    prisma.libraryEntry.count({ where: { userId, source: "FAMILY" } }),
    getCompleted(userId),
    prisma.gameLog.count({ where: { userId, review: { not: null } } }),
  ]);
  const platinums = completed.filter((c) => c.platinum);
  return {
    games: library._count._all,
    hours: Math.round((library._sum.playtimeMinutes ?? 0) / 60),
    hours2Weeks: Math.round((library._sum.playtime2WeeksMinutes ?? 0) / 60),
    platinums: platinums.length,
    rarePlatinums: platinums.filter((p) => p.rarity !== null && p.rarity < RARE_PERCENT).length,
    completed: completed.length,
    reviews,
    followers: user._count.followers,
    following: user._count.following,
    familyGames: family,
    accountDays: Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000),
    invites: user._count.invitees,
  };
}

// ---- XP e nível ---------------------------------------------------------------

/** Quanto vale cada coisa. Horas rendem pouco para não engolir platinas e reviews. */
export const XP_RULES = [
  { label: "Platina", xp: 100, of: (s: UserStats) => s.platinums },
  { label: "Platina rara (bônus)", xp: 100, of: (s: UserStats) => s.rarePlatinums },
  { label: "Jogo finalizado", xp: 40, of: (s: UserStats) => s.completed - s.platinums },
  { label: "Review escrita", xp: 20, of: (s: UserStats) => s.reviews },
  { label: "A cada 10 h jogadas", xp: 5, of: (s: UserStats) => Math.floor(s.hours / 10) },
  { label: "Jogo na biblioteca", xp: 1, of: (s: UserStats) => s.games },
  { label: "Seguidor", xp: 5, of: (s: UserStats) => s.followers },
] as const;

export function xpFromStats(s: UserStats) {
  return XP_RULES.reduce((acc, r) => acc + r.xp * r.of(s), 0);
}

/** XP total para chegar ao nível L: 50·L·(L−1) → nv. 2 = 100, nv. 5 = 1.000, nv. 10 = 4.500. */
export function xpForLevel(level: number) {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, floor, next, progress: (xp - floor) / (next - floor) };
}

export type LevelInfo = ReturnType<typeof levelFromXp>;

// ---- Selos -------------------------------------------------------------------

export type Badge = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** quanto já tem / quanto precisa */
  value: (s: UserStats) => number;
  target: number;
};

export const BADGES: Badge[] = [
  { id: "first-platinum", name: "Primeira platina", description: "Platine seu primeiro jogo", emoji: "🏆", value: (s) => s.platinums, target: 1 },
  { id: "platinum-hunter", name: "Caçador de platinas", description: "10 platinas", emoji: "🎯", value: (s) => s.platinums, target: 10 },
  { id: "platinum-legend", name: "Lenda das platinas", description: "25 platinas", emoji: "👑", value: (s) => s.platinums, target: 25 },
  { id: "rare-platinum", name: "Platina rara", description: `Uma platina que menos de ${RARE_PERCENT}% dos jogadores têm`, emoji: "💎", value: (s) => s.rarePlatinums, target: 1 },
  { id: "finisher", name: "Finalizador", description: "Finalize 10 jogos", emoji: "🏁", value: (s) => s.completed, target: 10 },
  { id: "critic", name: "Crítico", description: "Escreva 10 reviews", emoji: "✍️", value: (s) => s.reviews, target: 10 },
  { id: "marathoner", name: "Maratonista", description: "1.000 horas jogadas", emoji: "⏱️", value: (s) => s.hours, target: 1000 },
  { id: "no-life", name: "Sem vida social", description: "5.000 horas jogadas", emoji: "🧟", value: (s) => s.hours, target: 5000 },
  { id: "collector", name: "Colecionador", description: "100 jogos na biblioteca", emoji: "📚", value: (s) => s.games, target: 100 },
  { id: "hoarder", name: "Acumulador", description: "500 jogos na biblioteca", emoji: "🗄️", value: (s) => s.games, target: 500 },
  { id: "popular", name: "Popular", description: "10 seguidores", emoji: "⭐", value: (s) => s.followers, target: 10 },
  { id: "social", name: "Social", description: "Siga 10 jogadores", emoji: "🤝", value: (s) => s.following, target: 10 },
  { id: "recruiter", name: "Recrutador", description: "3 amigos entraram pelo seu convite", emoji: "📨", value: (s) => s.invites, target: 3 },
  { id: "family", name: "Família Steam", description: "Jogue um jogo da Família Steam", emoji: "👨‍👩‍👧", value: (s) => s.familyGames, target: 1 },
  { id: "veteran", name: "Veterano", description: "1 ano de GameLog", emoji: "🎖️", value: (s) => s.accountDays, target: 365 },
];

export function badgesFor(s: UserStats) {
  return BADGES.map((b) => {
    const value = b.value(s);
    return { id: b.id, name: b.name, description: b.description, emoji: b.emoji, target: b.target, value, earned: value >= b.target };
  });
}

export type BadgeState = ReturnType<typeof badgesFor>[number];

/** Tudo de uma vez (perfil, página de selos, comparação). */
export async function getProgression(userId: string) {
  const stats = await getUserStats(userId);
  const xp = xpFromStats(stats);
  return { stats, level: levelFromXp(xp), badges: badgesFor(stats) };
}
