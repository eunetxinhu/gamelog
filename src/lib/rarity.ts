import "server-only";
import { prisma } from "@/lib/prisma";
import { getGlobalAchievementPercentages } from "@/lib/steam/api";

/** Abaixo disso (% de jogadores) a platina/conquista ganha o selo de rara. */
export const RARE_PERCENT = 5;

/** Quantos jogos calcula por chamada (são requisições à Steam). */
const MAX_PER_CALL = 12;

type RarityGame = { id: string; steamAppId: number | null; platinumRarity: number | null; platinumRarityCheckedAt: Date | null };

/**
 * Raridade da platina = % de jogadores com a conquista mais rara do jogo (ninguém
 * tem a platina sem ela). Calculada uma vez por jogo e guardada em `games`.
 * Devolve o mapa id → raridade, já com os que acabaram de ser calculados.
 */
export async function ensurePlatinumRarity(games: RarityGame[]): Promise<Map<string, number | null>> {
  const out = new Map(games.map((g) => [g.id, g.platinumRarity]));
  const pending = games.filter((g) => g.steamAppId && !g.platinumRarityCheckedAt).slice(0, MAX_PER_CALL);

  await Promise.all(
    pending.map(async (g) => {
      const percents = await getGlobalAchievementPercentages(g.steamAppId!);
      const rarity = percents?.size ? Math.min(...percents.values()) : null;
      await prisma.game.update({ where: { id: g.id }, data: { platinumRarity: rarity, platinumRarityCheckedAt: new Date() } });
      out.set(g.id, rarity);
    }),
  );
  return out;
}

export function formatRarity(percent: number) {
  return `${percent.toLocaleString("pt-BR", { maximumFractionDigits: percent < 10 ? 1 : 0 })}%`;
}
