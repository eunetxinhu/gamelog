// Recompensa do cartaz de "Procurado" (sem banco: testável).

import type { UserStats } from "@/lib/progression";

/**
 * Quanto vale a cabeça do jogador, em berries. Cresce com o que dá mais trabalho:
 * platinas (sobretudo as raras), jogos finalizados, conquistas e horas. Arredonda
 * para 3 algarismos significativos, como nos cartazes ("1.230.000.000").
 */
export function bountyFor(s: Pick<UserStats, "platinums" | "rarePlatinums" | "completed" | "achievements" | "hours" | "reviews" | "followers">): number {
  const raw =
    s.platinums * 25_000_000 +
    s.rarePlatinums * 75_000_000 +
    s.completed * 5_000_000 +
    s.achievements * 50_000 +
    s.hours * 20_000 +
    s.reviews * 1_000_000 +
    s.followers * 500_000;
  if (raw <= 0) return 1_000_000; // todo pirata começa com alguma recompensa
  const digits = Math.floor(Math.log10(raw)) + 1;
  const step = 10 ** Math.max(0, digits - 3);
  return Math.round(raw / step) * step;
}

/** 1230000000 → "1.230.000.000" */
export function formatBounty(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** Título do cartaz conforme o tamanho da recompensa. */
export function bountyRank(n: number): string {
  if (n >= 4_000_000_000) return "Imperador dos Games";
  if (n >= 1_000_000_000) return "Supernova";
  if (n >= 300_000_000) return "Capitão Temido";
  if (n >= 50_000_000) return "Pirata Promissor";
  return "Novato do Mar";
}

/**
 * Endereço do cartaz com um carimbo que muda a cada hora (o mesmo tempo de cache da
 * imagem), para o navegador buscar a recompensa nova sem precisar recarregar à força.
 */
export function posterUrl(username: string, now: Date = new Date()): string {
  return `/u/${username}/recompensa.png?h=${Math.floor(now.getTime() / 3_600_000)}`;
}
