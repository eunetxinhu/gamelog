import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { firstDrawable, truncate } from "@/lib/og";
import { getWrapped, wrappedYears } from "@/lib/wrapped";
import { steamCoverUrl, steamHeaderUrl } from "@/lib/steam/assets";
import { SITE_NAME } from "@/lib/brand";

const SIZE = { width: 1080, height: 1350 };
const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" };
const fonts = Promise.all([
  readFile(join(process.cwd(), "src/assets/fonts/AlfaSlabOne.woff")),
  readFile(join(process.cwd(), "src/assets/fonts/Oswald-Bold.woff")),
]);

/**
 * Imagem da retrospectiva para compartilhar (formato de post do Instagram, 4:5).
 * Perfil privado não gera imagem: a retrospectiva é só para quem pode ver o perfil.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true, displayName: true, isPrivate: true, bannedAt: true } });
  if (!user || user.bannedAt || user.isPrivate) return new Response("Não disponível", { status: 404 });

  const years = await wrappedYears(user.id);
  const asked = Number(req.nextUrl.searchParams.get("ano"));
  const year = years.includes(asked) ? asked : years[0];
  if (!year) return new Response("Sem atividade", { status: 404 });

  const [[slab, oswald], w] = await Promise.all([fonts, getWrapped(user.id, year)]);
  const shelf = (w.topRated.length ? w.topRated.map((t) => t.game) : w.covers).slice(0, 4);
  const covers = await Promise.all(
    shelf.map((g) => firstDrawable([g.coverUrl, g.steamAppId ? steamCoverUrl(g.steamAppId) : null, g.steamAppId ? steamHeaderUrl(g.steamAppId) : null])),
  );
  const name = truncate(user.displayName ?? user.username, 20);
  const stats = [
    { label: "jogos", value: w.played },
    { label: "finalizados", value: w.completed },
    { label: "platinas", value: w.platinums.length, gold: true },
    { label: "reviews", value: w.reviews },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 72,
          color: "#fafafa",
          fontFamily: "Oswald",
          background: "linear-gradient(160deg, #43040a 0%, #0c0101 45%, #000 100%)",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 10, color: "#f8717a" }}>RETROSPECTIVA</div>
        <div style={{ display: "flex", fontFamily: "Slab", fontSize: 220, lineHeight: 1, marginTop: 10 }}>{year}</div>
        <div style={{ display: "flex", fontSize: 60, marginTop: 16 }}>{name}</div>

        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 50 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", width: "50%", marginBottom: 34 }}>
              <div style={{ display: "flex", fontFamily: "Slab", fontSize: 110, lineHeight: 1, color: s.gold ? "#fbbf24" : "#fafafa" }}>{s.value}</div>
              <div style={{ display: "flex", fontSize: 34, color: "#a1a1aa" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {w.genres[0] && (
          <div style={{ display: "flex", fontSize: 36, color: "#d4d4d8" }}>
            Gênero do ano:&nbsp;<span style={{ color: "#f8717a" }}>{w.genres[0].genre}</span>
            {w.bestMonth ? <span>&nbsp;· mês mais forte: {w.bestMonth.name}</span> : null}
          </div>
        )}

        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 16 }}>
            {covers.map((src, i) =>
              src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" width={150} height={200} style={{ objectFit: "cover", borderRadius: 12, border: "3px solid #7a1019" }} />
              ) : (
                <div key={i} style={{ display: "flex", width: 150, height: 200, borderRadius: 12, background: "#27272a" }} />
              ),
            )}
          </div>
          <div style={{ display: "flex", fontFamily: "Slab", fontSize: 34, color: "#ef3340" }}>{SITE_NAME}</div>
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
