import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Service worker do PWA: nunca em cache, sempre JavaScript, só scripts do próprio site
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // Fontes lidas do disco pelo gerador do cartaz de recompensa: garante que vão junto no deploy
  outputFileTracingIncludes: {
    "/u/[username]/recompensa.png": ["./src/assets/fonts/*.woff"],
  },
  experimental: {
    // Upload de foto/capa do perfil (o navegador já reduz a imagem; isto é a folga)
    serverActions: { bodySizeLimit: "5mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.rawg.io" },
      { protocol: "https", hostname: "shared.akamai.steamstatic.com" },
      { protocol: "https", hostname: "avatars.steamstatic.com" },
    ],
  },
};

export default nextConfig;
