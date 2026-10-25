import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { STEAM_MODE_COOKIE, STEAM_STATE_COOKIE, steamLoginUrl, type SteamLoginMode } from "@/lib/steam/openid";

/**
 * "Entrar com Steam": manda para o login oficial da Steam.
 *  - logado     → modo "link": vincula a Steam à conta atual
 *  - não logado → modo "signin": entra (ou cria a conta) pela Steam
 */
export async function GET() {
  const user = await getCurrentUser();
  const mode: SteamLoginMode = user ? "link" : "signin";
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
  return res;
}
