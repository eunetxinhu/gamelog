import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { STEAM_MODE_COOKIE, STEAM_STATE_COOKIE, verifySteamLogin } from "@/lib/steam/openid";
import { signInWithSteam } from "@/lib/steam/signin";
import { cleanRef, REF_COOKIE } from "@/lib/referral";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import type { SteamLinkErrorCode } from "@/app/(app)/settings/profile/_actions/types";

/**
 * Volta do "Entrar com Steam".
 *  - Logado: salva o SteamID confirmado pela Steam e manda para
 *    /settings/profile?steam=linked, onde a sincronização dispara sozinha.
 *  - Não logado (modo "signin"): entra na conta dessa Steam, ou cria uma.
 */
export async function GET(req: NextRequest) {
  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, appUrl()));
    res.cookies.delete({ name: STEAM_STATE_COOKIE, path: "/api/steam" });
    res.cookies.delete({ name: STEAM_MODE_COOKIE, path: "/api/steam" });
    res.cookies.delete({ name: REF_COOKIE, path: "/api/steam" });
    return res;
  };
  const done = (query: string) => redirectTo(`/settings/profile?${query}`);
  const fail = (code: SteamLinkErrorCode) => done(`steam_error=${code}`);

  const user = await getCurrentUser();
  const signin = !user && req.cookies.get(STEAM_MODE_COOKIE)?.value === "signin";
  if (!user && !signin) return redirectTo("/login?next=/settings/profile");

  const login = await verifySteamLogin(req.nextUrl.searchParams, req.cookies.get(STEAM_STATE_COOKIE)?.value);

  // ---- Entrar com Steam (sem sessão) ------------------------------------------
  if (!user) {
    if (!login.ok) return redirectTo(login.reason === "CANCELLED" ? "/login" : "/login?error=steam");
    if (!hasSupabaseAdmin()) return redirectTo("/login?error=steam");
    try {
      const { isNew } = await signInWithSteam(login.steamId, cleanRef(req.cookies.get(REF_COOKIE)?.value));
      // Conta nova cai em Contas vinculadas, que já sincroniza a biblioteca
      return redirectTo(isNew ? "/settings/profile?steam=linked" : "/feed");
    } catch (err) {
      console.error("[steam] entrar com Steam falhou", err);
      return redirectTo("/login?error=steam");
    }
  }

  // ---- Vincular à conta logada --------------------------------------------------
  if (!login.ok) {
    if (login.reason === "CANCELLED") return fail("STEAM_LOGIN_CANCELLED");
    if (login.reason === "UNAVAILABLE") return fail("STEAM_UNAVAILABLE");
    return fail("STEAM_LOGIN_INVALID");
  }

  const { steamId } = login;
  if (steamId === user.steamId) return done("steam=linked");

  try {
    const owner = await prisma.user.findUnique({ where: { steamId }, select: { id: true } });
    if (owner && owner.id !== user.id) return fail("STEAM_ALREADY_LINKED");

    // Vínculo novo ou troca de conta: a biblioteca da conta anterior sai e o
    // cooldown zera, para a primeira sincronização da conta nova rodar na hora.
    await prisma.$transaction([
      prisma.libraryEntry.deleteMany({ where: { userId: user.id, source: { in: ["STEAM", "FAMILY"] } } }),
      prisma.user.update({
        where: { id: user.id },
        data: { steamId, steamPersonaName: null, steamAvatarUrl: null, steamLastSyncAt: null },
      }),
    ]);
  } catch (err) {
    // Corrida: outro usuário vinculou o mesmo SteamID entre a checagem e o update
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("STEAM_ALREADY_LINKED");
    console.error("[steam] vínculo falhou", err);
    return fail("UNKNOWN");
  }

  revalidatePath(`/u/${user.username}`);
  revalidatePath("/settings/profile");
  return done("steam=linked");
}
