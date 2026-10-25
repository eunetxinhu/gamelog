import { describe, expect, it } from "vitest";
import { daysBetween, parseStoreRelease, todayInSaoPaulo } from "./dates";
import { detectSteamPrivacy } from "./privacy";
import { nextSyncAt, shouldTouchLastSeen, SYNC_INTERVAL, syncTier } from "./schedule";

describe("parseStoreRelease", () => {
  const iso = (raw: string) => parseStoreRelease(raw).date?.toISOString().slice(0, 10) ?? null;

  it("lê os formatos com dia exato", () => {
    expect(iso("12 nov. 2015")).toBe("2015-11-12");
    expect(iso("12 de nov. de 2015")).toBe("2015-11-12");
    expect(iso("3 de março de 2027")).toBe("2027-03-03");
    expect(iso("Nov 12, 2015")).toBe("2015-11-12");
    expect(iso("12 Nov, 2015")).toBe("2015-11-12");
    expect(iso("1 fev. 2026")).toBe("2026-02-01");
  });

  it("não inventa dia para datas aproximadas", () => {
    for (const raw of ["2027", "Q1 2027", "1º tri. 2027", "Em breve", "Coming soon", "novembro de 2026", "To be announced"]) {
      expect(parseStoreRelease(raw)).toEqual({ date: null, text: raw });
    }
  });

  it("rejeita dias que não existem", () => {
    expect(parseStoreRelease("31 fev. 2027").date).toBeNull();
  });

  it("vazio é vazio", () => {
    expect(parseStoreRelease("")).toEqual({ date: null, text: null });
    expect(parseStoreRelease(undefined)).toEqual({ date: null, text: null });
  });
});

describe("datas de São Paulo", () => {
  it("o dia vira à meia-noite de Brasília, não de UTC", () => {
    expect(todayInSaoPaulo(new Date("2026-10-25T02:30:00Z"))).toBe("2026-10-24");
    expect(todayInSaoPaulo(new Date("2026-10-25T03:30:00Z"))).toBe("2026-10-25");
  });

  it("conta dias entre datas", () => {
    expect(daysBetween("2026-10-25", "2026-11-01")).toBe(7);
    expect(daysBetween("2026-10-25", "2026-10-20")).toBe(-5);
  });
});

describe("detectSteamPrivacy", () => {
  it("biblioteca normal ou vazia não é privacidade", () => {
    expect(detectSteamPrivacy({ game_count: 2, games: [{}, {}] }, 3)).toEqual({ private: false });
    expect(detectSteamPrivacy({ game_count: 0 }, 3)).toEqual({ private: false });
  });

  it("resposta vazia com perfil público = detalhes dos jogos privados", () => {
    expect(detectSteamPrivacy({}, 3)).toEqual({ private: true, reason: "GAME_DETAILS" });
  });

  it("resposta vazia com perfil privado = perfil privado", () => {
    expect(detectSteamPrivacy({}, 1)).toEqual({ private: true, reason: "PROFILE" });
  });
});

describe("sincronização escalonada", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it("quem jogou nas últimas 2 semanas é ativo, mesmo sem visitar o site", () => {
    expect(syncTier({ minutesLast2Weeks: 30, lastSeenAt: null, now })).toBe("ACTIVE");
  });

  it("quem visitou o site há pouco é ativo", () => {
    expect(syncTier({ minutesLast2Weeks: 0, lastSeenAt: daysAgo(2), now })).toBe("ACTIVE");
  });

  it("sem jogar e sem visitar há mais de 30 dias fica dormente", () => {
    expect(syncTier({ minutesLast2Weeks: 0, lastSeenAt: daysAgo(45), now })).toBe("DORMANT");
    expect(syncTier({ minutesLast2Weeks: 0, lastSeenAt: null, now })).toBe("DORMANT");
  });

  it("o resto é diário", () => {
    expect(syncTier({ minutesLast2Weeks: 0, lastSeenAt: daysAgo(10), now })).toBe("REGULAR");
  });

  it("calcula a próxima sincronização pela faixa", () => {
    expect(nextSyncAt({ minutesLast2Weeks: 5, lastSeenAt: null, now }).getTime() - now.getTime()).toBe(SYNC_INTERVAL.ACTIVE);
  });

  it("registra visita no máximo 1x por hora", () => {
    expect(shouldTouchLastSeen(null, now)).toBe(true);
    expect(shouldTouchLastSeen(new Date(now.getTime() - 30 * 60_000), now)).toBe(false);
    expect(shouldTouchLastSeen(new Date(now.getTime() - 61 * 60_000), now)).toBe(true);
  });
});
