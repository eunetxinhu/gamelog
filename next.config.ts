import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
