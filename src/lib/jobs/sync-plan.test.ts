import { describe, expect, it } from "vitest";
import { chunk, jobProgress, retryDelayMs, summarize, wishlistDiff, type LibraryResult } from "./sync-plan";

describe("chunk e retryDelayMs", () => {
  it("divide em lotes", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 25)).toEqual([]);
  });
  it("espera cresce a cada tentativa", () => {
    expect(retryDelayMs(1)).toBe(10_000);
    expect(retryDelayMs(2)).toBe(40_000);
    expect(retryDelayMs(3)).toBe(160_000);
  });
});

describe("wishlistDiff", () => {
  it("importa o que está na Steam e não tem no site nem na biblioteca", () => {
    expect(wishlistDiff({ steam: [1, 2, 3], owned: [3], existing: [{ appId: 1, source: "MANUAL" }] })).toEqual({ add: [2], remove: [] });
  });
  it("tira o que saiu da wishlist da Steam ou foi comprado, mas nunca o que foi posto à mão", () => {
    const r = wishlistDiff({
      steam: [2],
      owned: [4],
      existing: [
        { appId: 1, source: "STEAM" }, // saiu da Steam
        { appId: 2, source: "STEAM" }, // continua
        { appId: 4, source: "STEAM" }, // comprou
        { appId: 5, source: "MANUAL" }, // posto à mão
      ],
    });
    expect(r.add).toEqual([]);
    expect(r.remove.sort()).toEqual([1, 4]);
  });
});

describe("jobProgress", () => {
  it("conta lotes de conquistas e calcula a porcentagem", () => {
    const p = jobProgress([
      { step: "LIBRARY", status: "DONE" },
      { step: "ACHIEVEMENTS", status: "DONE" },
      { step: "ACHIEVEMENTS", status: "RUNNING" },
      { step: "ACHIEVEMENTS", status: "QUEUED" },
      { step: "WISHLIST", status: "SKIPPED" },
      { step: "FINALIZE", status: "QUEUED" },
    ]);
    expect(p.steps.map((s) => [s.step, s.state, `${s.done}/${s.total}`])).toEqual([
      ["LIBRARY", "done", "1/1"],
      ["ACHIEVEMENTS", "running", "1/3"],
      ["WISHLIST", "skipped", "1/1"],
      ["FINALIZE", "waiting", "0/1"],
    ]);
    expect(p.percent).toBe(50);
  });
});

describe("summarize", () => {
  const lib: LibraryResult = {
    steamId: "1",
    personaName: "x",
    avatarUrl: "",
    totalGames: 10,
    newGames: 2,
    updatedGames: 8,
    removedGames: 0,
    totalHours: 100,
    recentlyPlayed: [],
    started: 1,
    playtimeHidden: false,
    minutesLast2Weeks: 60,
    achievementsDeferred: 5,
  };
  it("soma platinas dos lotes, raras e o que ficou para depois", () => {
    const s = summarize([
      { step: "LIBRARY", result: lib },
      { step: "ACHIEVEMENTS", result: { checked: 25, retry: 1, platinums: 2 } },
      { step: "ACHIEVEMENTS", result: { checked: 10, retry: 0, platinums: 1 } },
      { step: "RARE", result: { rare: 2 } },
      { step: "WISHLIST", result: { imported: 3, removed: 1, private: false } },
    ])!;
    expect(s.posted).toEqual({ platinums: 3, started: 1, rare: 2 });
    expect(s.pendingAchievementChecks).toBe(6);
    expect(s.wishlist).toEqual({ imported: 3, removed: 1, private: false });
    expect(s).not.toHaveProperty("minutesLast2Weeks");
  });
  it("sem a biblioteca não há resumo", () => {
    expect(summarize([{ step: "RARE", result: { rare: 1 } }])).toBeNull();
  });
});
