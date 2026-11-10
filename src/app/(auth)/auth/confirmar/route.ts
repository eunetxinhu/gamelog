import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { consumeToken, markEmailVerified } from "@/lib/auth/accounts";
import { startSession } from "@/lib/session";

/** Link de confirmação do cadastro: confirma o e-mail e já entra. */
export async function GET(req: NextRequest) {
  const userId = await consumeToken(req.nextUrl.searchParams.get("token"), "VERIFY_EMAIL");
  if (!userId) return NextResponse.redirect(new URL("/login?error=confirm", appUrl()));
  await markEmailVerified(userId);
  await startSession(userId);
  return NextResponse.redirect(new URL("/bem-vindo", appUrl()));
}
