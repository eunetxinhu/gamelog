import type { MetadataRoute } from "next";

/** Manifesto do app instalável (PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GameLog",
    short_name: "GameLog",
    description: "Sua vida gamer, platina por platina: Steam, platinas, reviews e amigos.",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    lang: "pt-BR",
    categories: ["games", "social", "entertainment"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Feed", url: "/feed" },
      { name: "Jogos", url: "/games" },
      { name: "Ranking", url: "/ranking" },
    ],
  };
}
