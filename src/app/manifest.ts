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
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
