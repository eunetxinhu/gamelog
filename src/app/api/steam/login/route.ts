import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { STEAM_STATE_COOKIE, steamLoginUrl } from "@/lib/steam/openid";

/** "Entrar com Steam": manda o usuário logado para o login oficial da Steam. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings/profile", appUrl()));

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(steamLoginUrl(state));
  res.cookies.set(STEAM_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // a volta da Steam é navegação GET de topo, então o cookie vai junto
    path: "/api/steam",
    maxAge: 10 * 60,
  });
  return res;
}
