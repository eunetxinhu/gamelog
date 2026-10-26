import { expect, test } from "@playwright/test";

test("visitante é mandado para o login nas páginas fechadas", async ({ page }) => {
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/login/);
});

test("página que não existe mostra o 404 temático", async ({ page }) => {
  const res = await page.goto("/essa-pagina-nao-existe-e2e");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Essa ilha não está no mapa")).toBeVisible();
});

test("visitante vê a página de um jogo", async ({ page }) => {
  await page.goto("/games/jogo-e2e");
  await expect(page.getByRole("heading", { name: "Jogo Ponta a Ponta" })).toBeVisible();
});
