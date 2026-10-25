import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { firstDrawable, OG_SIZE, truncate } from "@/lib/og";
import { steamCoverUrl, steamHeaderUrl } from "@/lib/steam/assets";

export const alt = "Publicação no Poneglyph.gg";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 600;

const STAR = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

const LABEL = {
  STARTED_GAME: { verb: "começou a jogar", badge: "JOGANDO AGORA", color: "#ef3340" },
  COMPLETED: { verb: "finalizou", badge: "FINALIZADO", color: "#34d399" },
  PLATINUM: { verb: "platinou", badge: "PLATINA CONQUISTADA", color: "#fbbf24" },
  DROPPED: { verb: "dropou", badge: "DROPADO", color: "#a1a1aa" },
  REVIEW: { verb: "avaliou", badge: "REVIEW", color: "#e0a2a4" },
  RARE_ACHIEVEMENT: { verb: "desbloqueou uma conquista rara em", badge: "CONQUISTA RARA", color: "#f8717a" },
  SCREENSHOT: { verb: "compartilhou fotos de", badge: "FOTOS", color: "#ef3340" },
} as const;

/** Card da publicação: capa do jogo, quem, o quê, nota e trecho da review. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.activity.findUnique({
    where: { id },
    select: {
      type: true,
      rating: true,
      review: true,
      containsSpoiler: true,
      user: { select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } },
      game: { select: { title: true, coverUrl: true, steamAppId: true } },
    },
  });

  if (!a) return fallback();

  const l = LABEL[a.type];
  const name = a.user.displayName ?? a.user.username;
  const appId = a.game.steamAppId;
  const [cover, avatar] = await Promise.all([
    firstDrawable([a.game.coverUrl, appId ? steamCoverUrl(appId) : null, appId ? steamHeaderUrl(appId) : null]),
    firstDrawable([a.user.avatarUrl, a.user.steamAvatarUrl]),
  ]);
  const review = a.review && !a.containsSpoiler ? truncate(a.review.replace(/\s+/g, " "), 170) : null;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#09090b", padding: 56, gap: 56, color: "#fafafa" }}>
        <div
          style={{
            display: "flex",
            width: 330,
            height: 518,
            borderRadius: 24,
            overflow: "hidden",
            background: "#27272a",
            border: `4px solid ${a.type === "PLATINUM" ? l.color : "#3f3f46"}`,
            flexShrink: 0,
          }}
        >
          {cover ? (
            <img src={cover} alt="" width={330} height={518} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", fontSize: 36, padding: 24, textAlign: "center" }}>
              {a.game.title}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {avatar ? (
              <img src={avatar} alt="" width={80} height={80} style={{ borderRadius: 999 }} />
            ) : (
              <div style={{ display: "flex", width: 80, height: 80, borderRadius: 999, background: "#d41b26", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 700 }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 34, fontWeight: 700 }}>{truncate(name, 28)}</span>
              <span style={{ fontSize: 26, color: "#a1a1aa" }}>{l.verb}</span>
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 36, fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{truncate(a.game.title, 48)}</div>

          <div style={{ display: "flex", marginTop: 24 }}>
            <span
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 2,
                color: l.color,
                border: `2px solid ${l.color}`,
                borderRadius: 999,
                padding: "8px 22px",
              }}
            >
              {l.badge}
            </span>
          </div>

          {a.rating && (
            // SVG em vez de "★": a fonte padrão do gerador não tem esse caractere
            <div style={{ display: "flex", marginTop: 24, gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <svg key={n} width="48" height="48" viewBox="0 0 24 24">
                  <path d={STAR} fill={n <= a.rating! ? "#fbbf24" : "#3f3f46"} />
                </svg>
              ))}
            </div>
          )}

          {review && <div style={{ display: "flex", marginTop: 20, fontSize: 28, color: "#d4d4d8", lineHeight: 1.35 }}>“{review}”</div>}

          <div style={{ display: "flex", marginTop: "auto", fontSize: 30, fontWeight: 800, color: "#ef3340" }}>Poneglyph.gg</div>
        </div>
      </div>
    ),
    size,
  );
}

function fallback() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#09090b", color: "#ef3340", fontSize: 96, fontWeight: 800 }}>
        Poneglyph.gg
      </div>
    ),
    size,
  );
}
