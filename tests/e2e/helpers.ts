import { expect, type BrowserContext, type Locator } from "@playwright/test";

// Mesmos ids de tests/e2e/seed.sql
export const USERS = {
  ana: "e2e00000-0000-4000-8000-000000000001",
  bia: "e2e00000-0000-4000-8000-000000000002",
  novo: "e2e00000-0000-4000-8000-000000000003",
} as const;

/** Entra como uma das contas de teste (cookie lido só quando E2E_AUTH=1, ver src/lib/e2e.ts). */
export async function loginAs(context: BrowserContext, baseURL: string | undefined, who: keyof typeof USERS) {
  await context.addCookies([{ name: "e2e_user", value: USERS[who], url: baseURL ?? "http://localhost:3000" }]);
}

/**
 * Preenche um campo controlado pelo React e espera o botão de enviar habilitar.
 * Se o texto entrou antes da hidratação, o React zera o estado: tenta de novo.
 */
export async function fillUntilEnabled(field: Locator, text: string, submit: Locator) {
  await expect(async () => {
    await field.fill("");
    await field.fill(text);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}
