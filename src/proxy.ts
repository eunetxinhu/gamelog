// Next.js 16: o antigo middleware.ts agora se chama proxy.ts.
// Renova a sessão do Supabase em cada request, protege rotas autenticadas e monta a
// Content Security Policy com um nonce novo (ver src/lib/csp.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { E2E_COOKIE, e2eAuthEnabled, e2eUserId } from "@/lib/e2e";
import { buildCsp, cspMode, makeNonce } from "@/lib/csp";

const PROTECTED = ["/settings", "/feed", "/log", "/notifications", "/mensagens", "/moderacao"];

export async function proxy(request: NextRequest) {
  // CSP com nonce: o Next lê o nonce do cabeçalho do request e marca os próprios scripts;
  // o navegador só roda script com essa marca. CSP_MODE=report-only só registra (emergência).
  const mode = cspMode(process.env.CSP_MODE);
  const nonce = makeNonce();
  const csp = mode === "off" ? null : buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });

  // Sempre a partir dos cabeçalhos atuais: a renovação da sessão pode ter trocado os cookies
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

  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Testes de ponta a ponta: sessão de mentira pelo cookie (nunca na Vercel, ver src/lib/e2e.ts)
  const e2eUser = e2eAuthEnabled() ? e2eUserId(request.cookies.get(E2E_COOKIE)?.value) : null;
  // getClaims confere o JWT localmente (chaves públicas em cache) e renova a sessão perto
  // de expirar; não vai ao servidor do Supabase a cada request como o getUser().
  const signedIn = e2eAuthEnabled() ? Boolean(e2eUser) : Boolean((await supabase.auth.getClaims()).data?.claims?.sub);
  const path = request.nextUrl.pathname;

  // Compara o segmento inteiro: "/log" protege "/log/..." mas não "/login".
  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|sw\\.js|manifest\\.webmanifest|icons/|icon|apple-icon|offline|.*\\.(?:png|jpg|jpeg|svg|webp|gif)$).*)"],
};
