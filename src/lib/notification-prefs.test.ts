import { describe, expect, it } from "vitest";
import { NOTIFICATION_CATEGORIES, parsePrefs, wantsInApp, wantsPush } from "./notification-prefs";

describe("parsePrefs", () => {
  it("sem nada salvo, tudo ligado (site e celular)", () => {
    const p = parsePrefs(null);
    expect(Object.values(p).every((v) => v === "push")).toBe(true);
    expect(Object.keys(p)).toHaveLength(NOTIFICATION_CATEGORIES.length);
  });

  it("valor inválido ou categoria desconhecida vira o padrão / é ignorada", () => {
    const p = parsePrefs({ reactions: "talvez", comments: "off", inventada: "off" });
    expect(p.reactions).toBe("push");
    expect(p.comments).toBe("off");
    expect("inventada" in p).toBe(false);
  });

  it("aguenta lixo", () => {
    expect(parsePrefs([1, 2]).deals).toBe("push");
    expect(parsePrefs("off").deals).toBe("push");
  });
});

describe("wantsInApp / wantsPush", () => {
  const prefs = { reactions: "off", comments: "app", deals: "push" };

  it("desligado: nem sino nem push", () => {
    expect(wantsInApp(prefs, "LIKE")).toBe(false);
    expect(wantsInApp(prefs, "GG")).toBe(false);
    expect(wantsPush(prefs, "LIKE")).toBe(false);
  });

  it("só no site: sino sim, push não", () => {
    expect(wantsInApp(prefs, "COMMENT")).toBe(true);
    expect(wantsPush(prefs, "COMMENT")).toBe(false);
  });

  it("site e celular: os dois", () => {
    expect(wantsInApp(prefs, "DEAL")).toBe(true);
    expect(wantsPush(prefs, "DEAL")).toBe(true);
  });

  it("categoria não configurada segue o padrão", () => {
    expect(wantsPush(prefs, "RELEASE")).toBe(true);
  });

  it("todo tipo de notificação tem uma categoria", () => {
    const covered = new Set(NOTIFICATION_CATEGORIES.flatMap((c) => c.types as readonly string[]));
    for (const t of ["LIKE", "GG", "COMMENT", "FOLLOW", "PLATINUM", "DEAL", "WEEKLY", "MESSAGE", "MENTION", "FOLLOW_REQUEST", "INVITE_JOINED", "RELEASE"]) {
      expect(covered.has(t)).toBe(true);
    }
  });
});
