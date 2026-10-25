import type { NextRequest } from "next/server";
import { appIcon } from "@/lib/app-icon";

const SIZES = new Set([192, 512]);

/** Ícones do manifesto: /icons/192, /icons/512 e /icons/512?maskable=1 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const res = appIcon(size, { maskable: req.nextUrl.searchParams.has("maskable") });
  res.headers.set("Cache-Control", "public, max-age=86400, immutable");
  return res;
}
