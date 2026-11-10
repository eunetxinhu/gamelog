import { expect, test } from "@playwright/test";

// Login de verdade (sem o cookie de teste): cadastro, sair, senha errada e entrar de novo.
// No CI não há envio de e-mail configurado, então o cadastro já nasce confirmado.
test("cadastro, sair e entrar com e-mail e senha", async ({ page, context }) => {
  const nick = `e2e_${Date.now().toString(36)}`;
  const email = `${nick}@exemplo.com`;

  await page.goto("/signup");
  await page.getByLabel("Nome de usuário").fill(nick);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-forte-123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).not.toHaveURL(/\/signup/);

  // Sessão própria: cookie httpOnly (o JavaScript da página não enxerga)
  const session = (await context.cookies()).find((c) => c.name === "pg_session");
  expect(session?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes("pg_session"))).toBe(false);

  // Sair apaga a sessão (cookie e banco)
  await page.goto("/feed");
  await page.getByRole("button", { name: "Sair" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).some((c) => c.name === "pg_session")).toBe(false);
  // O token antigo não vale mais, mesmo se alguém tiver copiado
  await context.addCookies([{ name: "pg_session", value: session!.value, domain: session!.domain, path: "/" }]);
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/login/);
  await context.clearCookies({ name: "pg_session" });
  await expect(page).toHaveURL(/\/login/);

  // Senha errada
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

  // Senha certa: volta para a página que a pessoa tentou abrir
  await page.getByLabel("Senha", { exact: true }).fill("senha-forte-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile/);
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
});

test("cookie de sessão inventado não entra", async ({ context, baseURL, page }) => {
  await context.addCookies([{ name: "pg_session", value: "A".repeat(43), url: baseURL ?? "http://localhost:3000" }]);
  await page.goto("/settings/profile");
  // O proxy deixa passar (tem cookie), mas a página não acha a sessão no banco
  await expect(page).toHaveURL(/\/login/);
});
