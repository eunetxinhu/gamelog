import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { firstDrawable, truncate } from "@/lib/og";
import { getProgression } from "@/lib/progression";
import { bountyFor, bountyRank, formatBounty } from "@/lib/bounty";
import { SITE_NAME } from "@/lib/brand";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Fontes do cartaz (OFL, em src/assets/fonts): Alfa Slab One no estilo cartaz antigo e Oswald para o resto
const fonts = Promise.all([
  readFile(join(process.cwd(), "src/assets/fonts/AlfaSlabOne.woff")),
  readFile(join(process.cwd(), "src/assets/fonts/Oswald-Bold.woff")),
]);

/** Formato de story / cartaz em pé. */
const SIZE = { width: 800, height: 1130 };
const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" };

const INK = "#3b2412"; // marrom de tinta velha
const PAPER = "linear-gradient(180deg, #f1e3c0 0%, #e6d09d 55%, #d7b97c 100%)";

/**
 * Cartaz de "Procurado" do perfil, com a recompensa em berries (src/lib/bounty.ts).
 * PNG em /u/<usuario>/recompensa.png, para baixar e postar em story ou Discord.
 * Perfil privado: o cartaz sai, mas a recompensa fica em segredo.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, isPrivate: true, bannedAt: true },
  });
  if (!user || user.bannedAt) return new Response("Não encontrado", { status: 404 });

  const [[slab, oswald], avatar, progression] = await Promise.all([
    fonts,
    firstDrawable([user.avatarUrl, user.steamAvatarUrl]),
    user.isPrivate ? null : getProgression(user.id),
  ]);
  const name = truncate(user.displayName ?? user.username, 22).toUpperCase();
  const bounty = progression ? bountyFor(progression.stats) : null;
  const s = progression?.stats;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#1a0d06", padding: 28, fontFamily: "Oswald" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            height: "100%",
            background: PAPER,
            border: `6px solid ${INK}`,
            padding: "36px 48px 30px",
            color: INK,
          }}
        >
          <div style={{ display: "flex", fontFamily: "Slab", fontSize: 94, letterSpacing: 1, lineHeight: 1 }}>PROCURADO</div>
          <div style={{ display: "flex", width: "100%", height: 4, background: INK, marginTop: 14, opacity: 0.7 }} />

          {/* Foto */}
          <div
            style={{
              display: "flex",
              marginTop: 26,
              width: 560,
              height: 520,
              border: `8px solid ${INK}`,
              background: "#c9ab72",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" width={560} height={520} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", fontFamily: "Slab", fontSize: 260, color: INK, opacity: 0.8 }}>{name.charAt(0)}</div>
            )}
          </div>

          <div style={{ display: "flex", marginTop: 20, fontSize: 40, letterSpacing: 14 }}>VIVO OU MORTO</div>
          <div style={{ display: "flex", marginTop: 4, fontFamily: "Slab", fontSize: 62, letterSpacing: 1, textAlign: "center" }}>{name}</div>

          {/* Recompensa */}
          <div style={{ display: "flex", alignItems: "center", marginTop: 6, fontFamily: "Slab", fontSize: 70 }}>
            {/* Símbolo de berry: um B cortado por uma linha vertical */}
            <div style={{ display: "flex", position: "relative", marginRight: 14, fontSize: 64 }}>
              B
              <div style={{ display: "flex", position: "absolute", left: 20, top: 4, width: 6, height: 74, background: INK }} />
            </div>
            {bounty === null ? "???" : formatBounty(bounty)}
          </div>

          <div style={{ display: "flex", marginTop: "auto", width: "100%", justifyContent: "space-between", alignItems: "flex-end", fontSize: 24 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 28 }}>{bounty === null ? "PERFIL PRIVADO" : bountyRank(bounty).toUpperCase()}</div>
              {s && (
                <div style={{ display: "flex", opacity: 0.8 }}>
                  {s.platinums} {s.platinums === 1 ? "platina" : "platinas"} · {s.completed} {s.completed === 1 ? "finalizado" : "finalizados"} ·{" "}
                  {s.hours.toLocaleString("pt-BR")} h
                </div>
              )}
            </div>
            <div style={{ display: "flex", fontFamily: "Slab", fontSize: 26, letterSpacing: 1 }}>{SITE_NAME.toUpperCase()}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: CACHE,
      fonts: [
        { name: "Slab", data: slab, weight: 400, style: "normal" },
        { name: "Oswald", data: oswald, weight: 700, style: "normal" },
      ],
    },
  );
}
