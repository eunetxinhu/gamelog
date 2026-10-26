import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIpHash, rateLimit } from "@/lib/rate-limit";
import { parseVitals } from "@/lib/vitals";

/** Recebe as medições de velocidade do navegador (components/web-vitals.tsx). */
export async function POST(req: NextRequest) {
  const limit = await rateLimit("vitals", await clientIpHash());
  if (!limit.ok) return new NextResponse(null, { status: 204 });
  const text = await req.text();
  if (text.length > 8_000) return new NextResponse(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const samples = parseVitals(body);
  if (samples.length) await prisma.webVital.createMany({ data: samples });
  return new NextResponse(null, { status: 204 });
}
