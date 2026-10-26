import { expect, test } from "@playwright/test";
import { fillUntilEnabled, loginAs } from "./helpers";

test.describe("logada como Ana", () => {
  test.beforeEach(async ({ context, baseURL }) => loginAs(context, baseURL, "ana"));

  test("registrar um jogo publica no feed", async ({ page }) => {
    const review = `Review de teste ${Date.now()}`;
    await page.goto("/games/jogo-e2e");
    await page.getByRole("group", { name: "Status" }).getByText("Finalizado", { exact: true }).click();
    await page.getByRole("button", { name: "4 estrelas" }).click();
    await page.locator("#review").fill(review);
    await page.getByRole("button", { name: "Salvar e compartilhar" }).click();
    await expect(page.getByText("Salvo e compartilhado no feed!")).toBeVisible();

    // A aba "Seguindo" inclui as próprias publicações (a "Para você" não)
    await page.goto("/feed?tab=following");
    await expect(page.getByText(review)).toBeVisible();
  });

  test("seguir alguém fica salvo depois de recarregar", async ({ page }) => {
    await page.goto("/u/e2e_bia");
    const follow = page.getByRole("button", { name: /^(Seguir|Seguindo)$/ }).first();
    if ((await follow.textContent())?.trim() === "Seguir") await follow.click();
    await expect(page.getByRole("button", { name: "Seguindo" }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Seguindo" }).first()).toBeVisible();
  });

  test("comentar numa publicação", async ({ page }) => {
    const body = `Boa! comentário ${Date.now()}`;
    await page.goto("/p/e2e-post-1");
    const send = page.getByRole("button", { name: "Comentar" });
    await fillUntilEnabled(page.getByLabel("Comentário", { exact: true }), body, send);
    await send.click();
    await expect(page.getByText(body)).toBeVisible();
    await page.reload();
    await expect(page.getByText(body)).toBeVisible();
  });

  test("busca com Ctrl+K encontra jogo e abre a página", async ({ page }) => {
    await page.goto("/feed");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Buscar" });
    await dialog.getByRole("combobox").fill("Ponta a Ponta");
    await expect(dialog.getByRole("option", { name: /Jogo Ponta a Ponta/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/games\/jogo-e2e/);
  });
});

test("conta nova não consegue postar link", async ({ context, baseURL, page }) => {
  await loginAs(context, baseURL, "novo");
  await page.goto("/p/e2e-post-1");
  const send = page.getByRole("button", { name: "Comentar" });
  await fillUntilEnabled(page.getByLabel("Comentário", { exact: true }), "ganhe skins em https://golpe.example.com", send);
  await send.click();
  await expect(page.getByText(/Contas novas ainda não podem postar links/)).toBeVisible();
});
