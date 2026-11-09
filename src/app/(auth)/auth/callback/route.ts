import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";

/** Links antigos de e-mail do Supabase (antes do login próprio): não valem mais. */
export function GET() {
  return NextResponse.redirect(new URL("/login?error=confirm", appUrl()));
}
