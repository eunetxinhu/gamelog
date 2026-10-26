// Next.js 16: o antigo middleware.ts agora se chama proxy.ts.
// Renova a sessão do Supabase em cada request e protege rotas autenticadas.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { E2E_COOKIE, e2eAuthEnabled, e2eUserId } from "@/lib/e2e";

const PROTECTED = ["/settings", "/feed", "/log", "/notifications", "/mensagens", "/moderacao"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
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
