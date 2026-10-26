import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("outra pessoa não vê o botão de apagar a lista", async ({ context, baseURL, page }) => {
  await loginAs(context, baseURL, "bia");
  await page.goto("/listas/e2e-lista");
  await expect(page.getByRole("heading", { name: "Lista E2E para apagar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apagar lista" })).toHaveCount(0);
});

test("apagar lista pela página dela usa a janela do site e sai da página", async ({ context, baseURL, page }) => {
  await loginAs(context, baseURL, "ana");
  // Nenhum confirm()/alert() do navegador pode aparecer
  page.on("dialog", (d) => {
    throw new Error(`janela do navegador apareceu: ${d.message()}`);
  });

  await page.goto("/listas/e2e-lista");
  await page.getByRole("button", { name: "Apagar lista" }).click();

  const dialog = page.getByRole("dialog", { name: /Apagar a lista/ });
  await expect(dialog).toBeVisible();
  // Cancelar não apaga
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Lista E2E para apagar" })).toBeVisible();

  await page.getByRole("button", { name: "Apagar lista" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar lista" }).click();
  await expect(page).toHaveURL(/\/listas$/);
  await expect(page.getByText("Lista E2E para apagar")).toHaveCount(0);

  const res = await page.goto("/listas/e2e-lista");
  expect(res?.status()).toBe(404);
});

