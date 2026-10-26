// Regras da fila de sincronização que não dependem de banco nem de rede (testáveis).

import type { SyncStep, SyncTaskStatus } from "@/generated/prisma/enums";

/** Jogos por tarefa de conquistas. Cada lote roda em paralelo com os outros. */
export const ACHIEVEMENT_CHUNK = 25;
/** Tentativas antes de desistir de uma tarefa. */
export const MAX_ATTEMPTS = 3;
/** Tarefa "rodando" há mais que isso: o worker caiu (timeout, deploy) e ela volta para a fila. */
export const STALE_LOCK_MS = 3 * 60 * 1000;
/** Workers paralelos acordados quando uma etapa cria várias tarefas. */
export const MAX_PARALLEL_WORKERS = 4;

export const STEP_LABEL: Record<SyncStep, string> = {
  LIBRARY: "Biblioteca e horas",
  ACHIEVEMENTS: "Conquistas e platinas",
  RARE: "Conquistas raras",
  COVERS: "Capas",
  WISHLIST: "Wishlist da Steam",
  FINALIZE: "Finalizando",
};

/** Ordem em que as etapas aparecem na tela. */
export const STEP_ORDER: SyncStep[] = ["LIBRARY", "ACHIEVEMENTS", "RARE", "WISHLIST", "COVERS", "FINALIZE"];

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Espera antes da próxima tentativa: 10 s, 40 s, 2 min 40 s… */
export function retryDelayMs(attempt: number): number {
  return 10_000 * 4 ** Math.max(0, attempt - 1);
}

// ---- Wishlist da Steam ---------------------------------------------------------

export type WishlistDiffInput = {
  /** appids na wishlist da Steam agora */
  steam: number[];
  /** appids que a pessoa já tem (biblioteca Steam): não entram, porque wishlist é "quero comprar" */
  owned: number[];
  /** o que já está na wishlist do site */
  existing: { appId: number; source: "MANUAL" | "STEAM" }[];
};

/**
 * O que importar e o que tirar. Itens adicionados à mão no site nunca saem por causa
 * da Steam; os que vieram da Steam saem quando saem de lá (ou quando a pessoa compra).
 */
export function wishlistDiff({ steam, owned, existing }: WishlistDiffInput): { add: number[]; remove: number[] } {
  const ownedSet = new Set(owned);
  const steamSet = new Set(steam);
  const have = new Set(existing.map((e) => e.appId));
  const add = [...steamSet].filter((id) => !have.has(id) && !ownedSet.has(id));
  const remove = existing.filter((e) => e.source === "STEAM" && (!steamSet.has(e.appId) || ownedSet.has(e.appId))).map((e) => e.appId);
  return { add, remove };
}

// ---- Progresso para a tela -------------------------------------------------------

export type TaskLite = { step: SyncStep; status: SyncTaskStatus };
export type StepProgress = { step: SyncStep; label: string; done: number; total: number; state: "waiting" | "running" | "done" | "failed" | "skipped" };

/** Situação de cada etapa (as conquistas contam lotes: "3 de 5"). */
export function jobProgress(tasks: TaskLite[]): { steps: StepProgress[]; percent: number } {
  const steps = STEP_ORDER.flatMap((step): StepProgress[] => {
    const mine = tasks.filter((t) => t.step === step);
    if (mine.length === 0) return [];
    const finished = mine.filter((t) => t.status === "DONE" || t.status === "SKIPPED" || t.status === "FAILED").length;
    const state: StepProgress["state"] =
      finished < mine.length
        ? mine.some((t) => t.status === "RUNNING") || finished > 0
          ? "running"
          : "waiting"
        : mine.every((t) => t.status === "SKIPPED")
          ? "skipped"
          : mine.some((t) => t.status === "FAILED")
            ? "failed"
            : "done";
    return [{ step, label: STEP_LABEL[step], done: finished, total: mine.length, state }];
  });
  const total = tasks.length;
  const finished = tasks.filter((t) => t.status === "DONE" || t.status === "SKIPPED" || t.status === "FAILED").length;
  return { steps, percent: total ? Math.round((finished / total) * 100) : 0 };
}

// ---- Resumo final --------------------------------------------------------------------

export type LibraryResult = {
  steamId: string;
  personaName: string;
  avatarUrl: string;
  totalGames: number;
  newGames: number;
  updatedGames: number;
  removedGames: number;
  totalHours: number;
  recentlyPlayed: { appId: number; name: string; hours2Weeks: number }[];
  started: number;
  playtimeHidden: boolean;
  minutesLast2Weeks: number;
  /** Jogos que ficaram para a próxima sincronização (fila de conquistas maior que o limite) */
  achievementsDeferred: number;
};
export type AchievementsResult = { checked: number; retry: number; platinums: number };
export type RareResult = { rare: number };
export type WishlistResult = { imported: number; removed: number; private: boolean };

export type SyncSummary = Omit<LibraryResult, "started" | "minutesLast2Weeks" | "achievementsDeferred"> & {
  posted: { platinums: number; started: number; rare: number };
  pendingAchievementChecks: number;
  wishlist: WishlistResult | null;
};

/** Junta o resultado das tarefas no resumo que a tela mostra. */
export function summarize(results: { step: SyncStep; result: unknown }[]): SyncSummary | null {
  const lib = results.find((r) => r.step === "LIBRARY")?.result as LibraryResult | undefined;
  if (!lib) return null;
  const ach = results.filter((r) => r.step === "ACHIEVEMENTS").map((r) => (r.result as AchievementsResult | null) ?? { checked: 0, retry: 0, platinums: 0 });
  const rare = results.filter((r) => r.step === "RARE").reduce((n, r) => n + ((r.result as RareResult | null)?.rare ?? 0), 0);
  const wishlist = (results.find((r) => r.step === "WISHLIST")?.result as WishlistResult | undefined) ?? null;
  const { started, minutesLast2Weeks: _m, achievementsDeferred, ...rest } = lib;
  void _m;
  return {
    ...rest,
    posted: { platinums: ach.reduce((n, a) => n + a.platinums, 0), started, rare },
    pendingAchievementChecks: achievementsDeferred + ach.reduce((n, a) => n + a.retry, 0),
    wishlist,
  };
}
