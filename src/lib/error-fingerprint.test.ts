import { describe, expect, it } from "vitest";
import { errorFingerprint, normalizeMessage, normalizePath } from "./error-fingerprint";

describe("agrupamento de erros", () => {
  it("rotas do mesmo tipo viram uma só", () => {
    expect(normalizePath("/u/ana/jogos?aba=x")).toBe("/u/:usuario/jogos");
    expect(normalizePath("/listas/clx123abc")).toBe("/listas/:id");
    expect(errorFingerprint("server", "falhou", "/u/ana")).toBe(errorFingerprint("server", "falhou", "/u/bia"));
  });

  it("ids e números na mensagem não separam o erro", () => {
    expect(normalizeMessage("Jogo 1145360 não encontrado (cjld2cjxh0000qzrmn831i7rn)")).toBe("Jogo :n não encontrado (:id)");
    expect(errorFingerprint("server", "timeout 5000ms", "/feed")).toBe(errorFingerprint("server", "timeout 8000ms", "/feed"));
  });

  it("tipos ou mensagens diferentes ficam separados", () => {
    expect(errorFingerprint("server", "a", "/feed")).not.toBe(errorFingerprint("client", "a", "/feed"));
    expect(errorFingerprint("server", "a", "/feed")).not.toBe(errorFingerprint("server", "b", "/feed"));
  });
});
