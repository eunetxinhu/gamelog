import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/brand";

/** Manifesto do app instalável (PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
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
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android recorta em círculo/gota: a arte vai a 80% sobre o fundo escuro
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // "Compartilhar" do celular → post de fotos (Web Share Target; ver public/sw.js)
    share_target: {
      action: "/compartilhar",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "fotos", accept: ["image/*"] }] },
    },
    shortcuts: [
      { name: "Feed", url: "/feed" },
      { name: "Jogos", url: "/games" },
      { name: "Ranking", url: "/ranking" },
    ],
  };
}
