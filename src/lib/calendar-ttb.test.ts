import { describe, expect, it } from "vitest";
import { groupReleases, monthLabel, untilLabel, type ReleaseItem } from "./release-calendar";
import { formatEstimate, MIN_COMMUNITY_SAMPLE, pickEstimate, sumEstimates } from "./time-to-beat-calc";

const item = (name: string, day: string | null, comingSoon = false, text: string | null = null): ReleaseItem<string> => ({ game: name, day, comingSoon, text });

describe("groupReleases", () => {
  const today = "2026-10-25";
  const cal = groupReleases(
    [
      item("Hoje", "2026-10-25"),
      item("Dezembro B", "2026-12-20"),
      item("Novembro", "2026-11-02"),
      item("Dezembro A", "2026-12-01"),
      item("Semana passada", "2026-10-18"),
      item("Ontem", "2026-10-24"),
      item("Antigo", "2020-01-01"),
      item("Em breve", null, true, "Em breve"),
      item("Lançado sem data", null, false),
    ],
    today,
  );

  it("separa hoje, próximos, sem data e recentes", () => {
    expect(cal.today.map((i) => i.game)).toEqual(["Hoje"]);
    expect(cal.undated.map((i) => i.game)).toEqual(["Em breve"]);
    expect(cal.recent.map((i) => i.game)).toEqual(["Ontem", "Semana passada"]);
  });

  it("agrupa os próximos por mês, em ordem", () => {
    expect(cal.upcoming.map((m) => m.month)).toEqual(["2026-11", "2026-12"]);
    expect(cal.upcoming[1].items.map((i) => i.game)).toEqual(["Dezembro A", "Dezembro B"]);
  });

  it("deixa de fora o que lançou há muito tempo e o que não tem data nem está para sair", () => {
    const all = [...cal.today, ...cal.recent, ...cal.undated, ...cal.upcoming.flatMap((m) => m.items)].map((i) => i.game);
    expect(all).not.toContain("Antigo");
    expect(all).not.toContain("Lançado sem data");
  });
});

describe("rótulos do calendário", () => {
  it("nome do mês em português", () => {
    expect(monthLabel("2026-11")).toBe("novembro de 2026");
  });

  it("quanto falta", () => {
    expect(untilLabel("2026-10-25", "2026-10-25")).toBe("hoje");
    expect(untilLabel("2026-10-25", "2026-10-26")).toBe("amanhã");
    expect(untilLabel("2026-10-25", "2026-10-30")).toBe("em 5 dias");
    expect(untilLabel("2026-10-25", "2026-11-15")).toBe("em 3 semanas");
    expect(untilLabel("2026-10-25", "2027-04-25")).toBe("em 6 meses");
    expect(untilLabel("2026-10-25", "2026-10-22")).toBe("há 3 dias");
  });
});

describe("tempo para zerar", () => {
  const community = (finishMedian: number | null, finishCount: number) => ({ finishMedian, finishCount, platinumMedian: null, platinumCount: 0 });

  it("prefere a comunidade quando há amostra suficiente", () => {
    expect(pickEstimate(community(1500, MIN_COMMUNITY_SAMPLE), 40)).toEqual({ minutes: 1500, source: "community", sample: 3 });
  });

  it("cai para a RAWG com amostra pequena", () => {
    expect(pickEstimate(community(1500, 1), 40)).toEqual({ minutes: 2400, source: "rawg" });
  });

  it("sem nada, sem estimativa", () => {
    expect(pickEstimate(undefined, null)).toBeNull();
    expect(pickEstimate(community(null, 0), 0)).toBeNull();
  });

  it("formata arredondando", () => {
    expect(formatEstimate(42)).toBe("~40 min");
    expect(formatEstimate(3)).toBe("~5 min");
    expect(formatEstimate(5 * 60 + 20)).toBe("~5,5 h");
    expect(formatEstimate(1250 * 60)).toBe("~1.250 h");
  });

  it("soma o backlog e conta quantos têm estimativa", () => {
    expect(sumEstimates([{ minutes: 600, source: "rawg" }, null, { minutes: 120, source: "community", sample: 4 }])).toEqual({
      minutes: 720,
      covered: 2,
      total: 3,
    });
  });
});
