// Estatísticas de conquistas da biblioteca (sem banco: testável).

export type AchievementRow = { unlocked: number | null; total: number | null };

export type AchievementStats = {
  /** Jogos com conquistas conhecidas */
  games: number;
  /** Jogos com pelo menos uma conquista desbloqueada */
  started: number;
  unlocked: number;
  /** Jogos com 100% das conquistas */
  perfect: number;
  /** Média do % de cada jogo começado (mesma conta da "taxa média de conclusão" da Steam) */
  avgCompletion: number;
};

/** % concluído, arredondado para baixo: 99,6% não pode aparecer como 100%. */
export function completionPercent(unlocked: number | null, total: number | null): number {
  if (!total || total <= 0) return 0;
  return Math.floor((Math.min(unlocked ?? 0, total) / total) * 100);
}

export function achievementStats(rows: AchievementRow[]): AchievementStats {
  const known = rows.filter((r) => (r.total ?? 0) > 0);
  const started = known.filter((r) => (r.unlocked ?? 0) > 0);
  const avg = started.length ? started.reduce((acc, r) => acc + (r.unlocked ?? 0) / r.total!, 0) / started.length : 0;
  return {
    games: known.length,
    started: started.length,
    unlocked: known.reduce((acc, r) => acc + Math.min(r.unlocked ?? 0, r.total!), 0),
    perfect: known.filter((r) => (r.unlocked ?? 0) >= r.total!).length,
    avgCompletion: Math.floor(avg * 100),
  };
}
