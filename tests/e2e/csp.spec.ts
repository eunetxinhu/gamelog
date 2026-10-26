import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

/** Junta todo bloqueio da CSP que acontecer na página. */
async function collectViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

test("a CSP não bloqueia nada do próprio site", async ({ context, baseURL, page }) => {
  await loginAs(context, baseURL, "ana");
  const violations = await collectViolations(page);
  for (const path of ["/", "/feed", "/games", "/games/jogo-e2e", "/u/e2e_ana", "/u/e2e_ana/jogos", "/listas", "/clubes", "/mensagens", "/settings/profile", "/pagina-que-nao-existe"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await violations(), `bloqueio em ${path}`).toEqual([]);
  }
  // O JavaScript do site roda (scripts com o nonce): a busca abre
  await page.goto("/feed");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Buscar" })).toBeVisible();
});

test("script injetado no HTML não roda", async ({ context, page }) => {
  await context.route("**/login", async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      "</body>",
      '<script>window.__xss="script"</script><img src="x" onerror="window.__xss=\'onerror\'"></body>',
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto("/login", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __xss?: string }).__xss ?? null)).toBeNull();
  const csp = (await page.request.get("/login")).headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
});
