import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("Quero jogar e Wishlist são coisas separadas", async ({ context, baseURL, page }) => {
  await loginAs(context, baseURL, "bia");
  await page.goto("/games/jogo-e2e");

  // Quero jogar: vai para a fila (status "Quero jogar", sem publicar)
  await page.getByRole("button", { name: "Quero jogar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Na fila" })).toBeVisible();
  await expect(page.getByText(/No seu perfil como\s*Quero jogar/)).toBeVisible();

  // Wishlist: independente
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Na wishlist" })).toBeVisible();

  await page.goto("/u/e2e_bia/jogos?aba=backlog");
  await expect(page.getByRole("link", { name: /Quero jogar\s*1/ })).toBeVisible();
  await expect(page.getByText("Jogo Ponta a Ponta").first()).toBeVisible();
  await page.goto("/u/e2e_bia/jogos?aba=wishlist");
  await expect(page.getByRole("link", { name: /Wishlist\s*1/ })).toBeVisible();

  // Tirar da fila não mexe na wishlist
  await page.goto("/games/jogo-e2e");
  await page.getByRole("button", { name: "Na fila" }).click();
  await expect(page.getByRole("button", { name: "Quero jogar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Na wishlist" })).toBeVisible();
});
