import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { firstDrawable, OG_SIZE, truncate } from "@/lib/og";
import { steamCoverUrl, steamHeaderUrl } from "@/lib/steam/assets";

export const alt = "Perfil no Poneglyph.gg";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 600;

/** Card do perfil: capa de fundo, avatar, números e o Top 4. */
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
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
      favorites: { orderBy: { position: "asc" }, select: { game: { select: { title: true, coverUrl: true, steamAppId: true } } } },
    },
  });

  if (!user || user.bannedAt) {
    return new ImageResponse(
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#09090b", color: "#ef3340", fontSize: 96, fontWeight: 800 }}>
        Poneglyph.gg
      </div>,
      size,
    );
  }

  // Perfil privado: o card mostra só nome e avatar
  if (user.isPrivate) user.favorites = [];
  const [library, platinumLogs, steamPlatinums] = await Promise.all([
    prisma.libraryEntry.aggregate({ where: { userId: user.id }, _count: { _all: true }, _sum: { playtimeMinutes: true } }),
    prisma.gameLog.findMany({ where: { userId: user.id, status: "PLATINUM" }, select: { gameId: true } }),
    prisma.libraryEntry.findMany({ where: { userId: user.id, platinumAt: { not: null } }, select: { gameId: true } }),
  ]);
  const platinums = new Set([...platinumLogs, ...steamPlatinums].map((p) => p.gameId)).size;

  const [avatar, banner, ...covers] = await Promise.all([
    firstDrawable([user.avatarUrl, user.steamAvatarUrl]),
    firstDrawable([user.bannerUrl]),
    ...user.favorites.map(({ game }) =>
      firstDrawable([game.coverUrl, game.steamAppId ? steamCoverUrl(game.steamAppId) : null, game.steamAppId ? steamHeaderUrl(game.steamAppId) : null]),
    ),
  ]);
  const name = user.displayName ?? user.username;
  const stats = [
    { label: "jogos", value: library._count._all.toLocaleString("pt-BR") },
    { label: "horas", value: Math.round((library._sum.playtimeMinutes ?? 0) / 60).toLocaleString("pt-BR") },
    { label: "platinas", value: platinums.toLocaleString("pt-BR"), gold: true },
  ];

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: "#09090b", color: "#fafafa" }}>
        {banner && (
          <img src={banner} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, objectFit: "cover", width: "100%", height: "100%", opacity: 0.35 }} />
        )}
        <div style={{ display: "flex", position: "absolute", inset: 0, background: "linear-gradient(90deg, #09090b 35%, rgba(9,9,11,0.6))" }} />

        <div style={{ display: "flex", position: "relative", width: "100%", padding: 64, gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {avatar ? (
              <img src={avatar} alt="" width={150} height={150} style={{ borderRadius: 999, border: "6px solid #18181b" }} />
            ) : (
              <div style={{ display: "flex", width: 150, height: 150, borderRadius: 999, background: "#d41b26", alignItems: "center", justifyContent: "center", fontSize: 72, fontWeight: 700 }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", marginTop: 28, fontSize: 64, fontWeight: 800 }}>{truncate(name, 22)}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa" }}>@{user.username}</div>

            <div style={{ display: user.isPrivate ? "none" : "flex", gap: 44, marginTop: 40 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 52, fontWeight: 800, color: s.gold ? "#fbbf24" : "#fafafa" }}>{s.value}</span>
                  <span style={{ fontSize: 24, color: "#a1a1aa" }}>{s.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", marginTop: "auto", fontSize: 30, fontWeight: 800, color: "#ef3340" }}>Poneglyph.gg</div>
          </div>

          {covers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, width: 356, alignContent: "center" }}>
              {covers.map((src, i) =>
                src ? (
                  <img key={i} src={src} alt="" width={170} height={227} style={{ objectFit: "cover", borderRadius: 16, border: "3px solid #3f3f46" }} />
                ) : (
                  <div key={i} style={{ display: "flex", width: 170, height: 227, borderRadius: 16, background: "#27272a", alignItems: "center", justifyContent: "center", padding: 12, fontSize: 22, textAlign: "center" }}>
                    {truncate(user.favorites[i].game.title, 30)}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
