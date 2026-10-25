import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildAccountExport } from "@/lib/account-data";
import { rateLimit } from "@/lib/rate-limit";

/** Baixa um JSON com todos os dados da conta logada (Configurações → Seus dados). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Faça login para exportar seus dados." }, { status: 401 });

  const limit = await rateLimit("data-export", user.id);
  if (!limit.ok) return NextResponse.json({ error: limit.message }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });

  const data = await buildAccountExport(user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="poneglyph-${user.username}-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
