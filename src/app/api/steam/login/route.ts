import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { STEAM_MODE_COOKIE, STEAM_STATE_COOKIE, steamLoginUrl, type SteamLoginMode } from "@/lib/steam/openid";
import { cleanRef, REF_COOKIE } from "@/lib/referral";
import { clientIpHash, rateLimit } from "@/lib/rate-limit";

/**
 * "Entrar com Steam": manda para o login oficial da Steam.
 *  - logado     → modo "link": vincula a Steam à conta atual
 *  - não logado → modo "signin": entra (ou cria a conta) pela Steam
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const mode: SteamLoginMode = user ? "link" : "signin";
  // "Entrar com Steam" pode criar conta: limita por IP contra criação em massa
  if (!(await rateLimit("steam-login:ip", user?.id ?? (await clientIpHash()))).ok) {
    return NextResponse.redirect(new URL(user ? "/settings/profile?steam_error=STEAM_UNAVAILABLE" : "/login?error=limite", appUrl()));
  }
  if (mode === "signin" && !hasSupabaseAdmin()) {
    return NextResponse.redirect(new URL("/login?error=steam", appUrl()));
  }

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(steamLoginUrl(state));
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, // a volta da Steam é navegação GET de topo, então o cookie vai junto
    path: "/api/steam",
    maxAge: 10 * 60,
  };
  res.cookies.set(STEAM_STATE_COOKIE, state, cookie);
  res.cookies.set(STEAM_MODE_COOKIE, mode, cookie);
  // Veio de /convite/<usuario>: guarda quem convidou para aplicar quando a conta for criada
  const ref = cleanRef(req.nextUrl.searchParams.get("ref"));
  if (mode === "signin" && ref) res.cookies.set(REF_COOKIE, ref, cookie);
  return res;
}
