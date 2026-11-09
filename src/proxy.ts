// Next.js 16: o antigo middleware.ts agora se chama proxy.ts.
// Protege rotas autenticadas (manda ao login quem não tem sessão) e monta a
// Content Security Policy com um nonce novo (ver src/lib/csp.ts).
import { NextResponse, type NextRequest } from "next/server";
import { E2E_COOKIE, e2eAuthEnabled, e2eUserId } from "@/lib/e2e";
import { buildCsp, cspMode, makeNonce } from "@/lib/csp";

// Mesmo nome de src/lib/session.ts (que é só do servidor e não entra aqui)
const SESSION_COOKIE = "pg_session";

const PROTECTED = ["/settings", "/feed", "/log", "/notifications", "/mensagens", "/moderacao"];

export async function proxy(request: NextRequest) {
  // CSP com nonce: o Next lê o nonce do cabeçalho do request e marca os próprios scripts;
  // o navegador só roda script com essa marca. CSP_MODE=report-only só registra (emergência).
  const mode = cspMode(process.env.CSP_MODE);
  const nonce = makeNonce();
  const csp = mode === "off" ? null : buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });

  const next = () => {
    const headers = new Headers(request.headers);
    if (csp) {
      headers.set("x-nonce", nonce);
      headers.set("Content-Security-Policy", csp);
    }
    const res = NextResponse.next({ request: { headers } });
    if (csp) {
      res.headers.set(mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", csp);
      res.headers.set("Reporting-Endpoints", 'csp="/api/csp-report"');
    }
    return res;
  };

  // Só confere se há cookie de sessão para mandar ao login; quem valida a sessão de
  // verdade é o getCurrentUser (banco), nas páginas e ações.
  const e2eUser = e2eAuthEnabled() ? e2eUserId(request.cookies.get(E2E_COOKIE)?.value) : null;
  const signedIn = Boolean(e2eUser) || Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const path = request.nextUrl.pathname;

  // Compara o segmento inteiro: "/log" protege "/log/..." mas não "/login".
  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|sw\\.js|manifest\\.webmanifest|icons/|icon|apple-icon|offline|.*\\.(?:png|jpg|jpeg|svg|webp|gif)$).*)"],
};
