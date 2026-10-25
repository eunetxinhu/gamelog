import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { firstDrawable, truncate } from "@/lib/og";
import { getPlaying } from "@/lib/profile-games";
import { getProgression } from "@/lib/progression";
import { steamCoverUrl, steamHeaderUrl } from "@/lib/steam/assets";
import { appUrl } from "@/lib/app-url";

const SIZE = { width: 1200, height: 400 };
/** CDN guarda por 1 h e serve a versão velha por até 1 dia enquanto renova. */
const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" };

/**
 * Card do perfil para incorporar fora do Poneglyph.gg: assinatura de fórum, README do
 * GitHub, bio. Imagem PNG em /u/<usuario>/card.png (Configurações → Perfil mostra
 * os códigos prontos). Perfil privado mostra só nome e avatar.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      steamAvatarUrl: true,
      bannerUrl: true,
      isPrivate: true,
      bannedAt: true,
      favorites: { orderBy: { position: "asc" }, take: 3, select: { game: { select: { title: true, coverUrl: true, steamAppId: true } } } },
    },
  });

  const host = new URL(appUrl()).host;
  if (!user || user.bannedAt) return brandOnly(host);

  const name = user.displayName ?? user.username;
  const avatar = await firstDrawable([user.avatarUrl, user.steamAvatarUrl]);

  let stats: { label: string; value: string; gold?: boolean }[] = [];
  let level: number | null = null;
  let shelfTitle = "";
  let shelf: { title: string; coverUrl: string | null; steamAppId: number | null }[] = [];

  if (!user.isPrivate) {
    const [progression, playing] = await Promise.all([getProgression(user.id), getPlaying(user.id, 3)]);
    level = progression.level.level;
    const s = progression.stats;
    stats = [
      { label: "jogos", value: s.games.toLocaleString("pt-BR") },
      { label: "horas", value: s.hours.toLocaleString("pt-BR") },
      { label: "finalizados", value: s.completed.toLocaleString("pt-BR") },
      { label: "platinas", value: s.platinums.toLocaleString("pt-BR"), gold: true },
    ];
    if (playing.length > 0) {
      shelfTitle = "JOGANDO AGORA";
      shelf = playing.map((p) => p.game);
    } else if (user.favorites.length > 0) {
      shelfTitle = "FAVORITOS";
      shelf = user.favorites.map((f) => f.game);
    }
  }

  const [banner, ...covers] = await Promise.all([
    user.isPrivate ? null : firstDrawable([user.bannerUrl]),
    ...shelf.map((g) =>
      firstDrawable([g.coverUrl, g.steamAppId ? steamCoverUrl(g.steamAppId) : null, g.steamAppId ? steamHeaderUrl(g.steamAppId) : null]),
    ),
  ]);

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: "#09090b", color: "#fafafa", borderRadius: 32, overflow: "hidden" }}>
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" width={1200} height={400} style={{ position: "absolute", inset: 0, objectFit: "cover", width: "100%", height: "100%", opacity: 0.3 }} />
        )}
        <div style={{ display: "flex", position: "absolute", inset: 0, background: "linear-gradient(90deg, #09090b 40%, rgba(9,9,11,0.55))" }} />

        <div style={{ display: "flex", position: "relative", width: "100%", padding: 48, gap: 40, alignItems: "center" }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" width={168} height={168} style={{ borderRadius: 999, border: "6px solid #27272a", flexShrink: 0 }} />
          ) : (
            <div style={{ display: "flex", width: 168, height: 168, borderRadius: 999, background: "#0284c7", alignItems: "center", justifyContent: "center", fontSize: 80, fontWeight: 700, flexShrink: 0 }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span style={{ fontSize: 56, fontWeight: 800 }}>{truncate(name, 18)}</span>
              {level !== null && (
                <span style={{ display: "flex", fontSize: 26, fontWeight: 800, color: "#09090b", background: "#38bdf8", borderRadius: 999, padding: "4px 16px" }}>
                  Nv. {level}
                </span>
              )}
            </div>
            <span style={{ fontSize: 28, color: "#a1a1aa" }}>@{user.username}</span>

            {user.isPrivate ? (
              <span style={{ display: "flex", marginTop: 28, fontSize: 28, color: "#a1a1aa" }}>🔒 Perfil privado</span>
            ) : (
              <div style={{ display: "flex", gap: 40, marginTop: 28 }}>
                {stats.map((s) => (
                  <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 44, fontWeight: 800, color: s.gold ? "#fbbf24" : "#fafafa" }}>{s.value}</span>
                    <span style={{ fontSize: 22, color: "#a1a1aa" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            <span style={{ display: "flex", marginTop: 24, fontSize: 24, fontWeight: 800, color: "#38bdf8" }}>
              Poneglyph.gg <span style={{ marginLeft: 12, fontWeight: 400, color: "#52525b" }}>{host}</span>
            </span>
          </div>

          {covers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, color: "#71717a" }}>{shelfTitle}</span>
              <div style={{ display: "flex", gap: 14 }}>
                {covers.map((src, i) =>
                  src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" width={150} height={200} style={{ objectFit: "cover", borderRadius: 14, border: "3px solid #3f3f46" }} />
                  ) : (
                    <div key={i} style={{ display: "flex", width: 150, height: 200, borderRadius: 14, background: "#27272a", alignItems: "center", justifyContent: "center", padding: 10, fontSize: 18, textAlign: "center" }}>
                      {truncate(shelf[i].title, 28)}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...SIZE, headers: CACHE },
  );
}

function brandOnly(host: string) {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#09090b" }}>
        <span style={{ fontSize: 96, fontWeight: 800, color: "#38bdf8" }}>Poneglyph.gg</span>
        <span style={{ fontSize: 28, color: "#52525b" }}>{host}</span>
      </div>
    ),
    { ...SIZE, headers: CACHE },
  );
}
