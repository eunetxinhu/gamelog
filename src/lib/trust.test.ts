import { describe, expect, it } from "vitest";
import { checkNewAccountText, containsLink, hoursLeft, isNewAccount } from "./trust";

const now = new Date("2026-10-25T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("conta nova", () => {
  it("é nova por 72 h; admin nunca", () => {
    expect(isNewAccount({ createdAt: ago(10) }, now)).toBe(true);
    expect(isNewAccount({ createdAt: ago(73) }, now)).toBe(false);
    expect(isNewAccount({ createdAt: ago(1), isAdmin: true }, now)).toBe(false);
    expect(hoursLeft(ago(70.5), now)).toBe(2);
  });

  it("reconhece links, mas não texto comum", () => {
    for (const t of ["veja https://x.co", "www.golpe.net", "entra no discord.gg/abc", "bit.ly/abc", "SITE.COM.BR"]) expect(containsLink(t)).toBe(true);
    for (const t of ["que jogo bom", "nota 9.5 de 10", "platinei 3.2 mil conquistas", "e-mail? não"]) expect(containsLink(t)).toBe(false);
  });

  it("bloqueia link só de conta nova", () => {
    expect(checkNewAccountText({ createdAt: new Date() }, "olha www.x.com")).toMatch(/Contas novas/);
    expect(checkNewAccountText({ createdAt: new Date() }, "sem link")).toBeNull();
    expect(checkNewAccountText({ createdAt: ago(1000) }, "olha www.x.com")).toBeNull();
  });
});
