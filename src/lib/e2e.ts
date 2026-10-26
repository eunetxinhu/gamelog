// Login de mentira SÓ para os testes de ponta a ponta (Playwright no CI).
// Liga com E2E_AUTH=1 e nunca na Vercel: lá a variável não existe e, mesmo que
// alguém cadastre, `VERCEL` está sempre definida e desliga isto.

export const E2E_COOKIE = "e2e_user";

export function e2eAuthEnabled(): boolean {
  return process.env.E2E_AUTH === "1" && !process.env.VERCEL;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id do usuário do cookie de teste (só formato UUID). */
export function e2eUserId(cookie: string | undefined): string | null {
  return cookie && UUID.test(cookie) ? cookie : null;
}
