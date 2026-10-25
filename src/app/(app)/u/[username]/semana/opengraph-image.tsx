import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { firstDrawable, OG_SIZE, truncate } from "@/lib/og";
import { steamCoverUrl, steamHeaderUrl } from "@/lib/steam/assets";
import { getWeeklySummary } from "@/lib/weekly";

export const alt = "Resumo da semana no Poneglyph.gg";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 1800;

/** Card do resumo semanal: números da semana + capas dos mais jogados. */
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true },
  });
  if (!user) {
    return new ImageResponse(
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#09090b", color: "#38bdf8", fontSize: 96, fontWeight: 800 }}>
        Poneglyph.gg
      </div>,
      size,
    );
  }

  const w = await getWeeklySummary(user.id);
  const [avatar, ...covers] = await Promise.all([
    firstDrawable([user.avatarUrl, user.steamAvatarUrl]),
    ...w.topGames.map(({ game }) =>
      firstDrawable([game.coverUrl, game.steamAppId ? steamCoverUrl(game.steamAppId) : null, game.steamAppId ? steamHeaderUrl(game.steamAppId) : null]),
    ),
  ]);
  const name = user.displayName ?? user.username;
  const stats = [
    { label: "platinas", value: w.platinums.length, color: "#fbbf24" },
    { label: "finalizados", value: w.completed.length, color: "#34d399" },
    { label: "jogos novos", value: w.started.length, color: "#38bdf8" },
    { label: "h em 2 semanas", value: w.hours2Weeks, color: "#fafafa" },
  ];

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "linear-gradient(135deg, #0c1a2e, #09090b 55%, #1e1033)", color: "#fafafa", padding: 64, gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {avatar ? (
              <img src={avatar} alt="" width={88} height={88} style={{ borderRadius: 999 }} />
            ) : (
              <div style={{ display: "flex", width: 88, height: 88, borderRadius: 999, background: "#0284c7", alignItems: "center", justifyContent: "center", fontSize: 44 }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 26, color: "#a1a1aa" }}>A semana de</span>
              <span style={{ fontSize: 46, fontWeight: 800 }}>{truncate(name, 22)}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 36, marginTop: 56 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", width: 220 }}>
                <span style={{ fontSize: 72, fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 26, color: "#a1a1aa" }}>{s.label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: "auto", fontSize: 30, fontWeight: 800, color: "#38bdf8" }}>Poneglyph.gg</div>
        </div>

        {covers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
            {covers.slice(0, 3).map((src, i) =>
              src ? (
                <img key={i} src={src} alt="" width={150} height={150} style={{ objectFit: "cover", borderRadius: 16, border: "3px solid #3f3f46" }} />
              ) : (
                <div key={i} style={{ display: "flex", width: 150, height: 150, borderRadius: 16, background: "#27272a" }} />
              ),
            )}
          </div>
        )}
      </div>
    ),
    size,
  );
}
