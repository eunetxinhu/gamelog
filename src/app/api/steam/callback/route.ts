import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { STEAM_STATE_COOKIE, verifySteamLogin } from "@/lib/steam/openid";
import type { SteamLinkErrorCode } from "@/app/(app)/settings/profile/_actions/types";

/**
 * Volta do "Entrar com Steam". Salva o SteamID confirmado pela Steam e manda
 * para /settings/profile?steam=linked, onde a sincronização dispara sozinha.
 */
export async function GET(req: NextRequest) {
  const done = (query: string) => {
    const res = NextResponse.redirect(new URL(`/settings/profile?${query}`, appUrl()));
    res.cookies.delete({ name: STEAM_STATE_COOKIE, path: "/api/steam" });
    return res;
  };
  const fail = (code: SteamLinkErrorCode) => done(`steam_error=${code}`);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings/profile", appUrl()));

  const login = await verifySteamLogin(req.nextUrl.searchParams, req.cookies.get(STEAM_STATE_COOKIE)?.value);
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
      prisma.libraryEntry.deleteMany({ where: { userId: user.id, source: "STEAM" } }),
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
