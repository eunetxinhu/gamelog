import type { NextConfig } from "next";

// Cabeçalhos de segurança em todas as respostas.
// Esta CSP é a básica, para o que não passa pelo proxy (arquivos, API): ninguém coloca o
// site num iframe, <base> e plugins bloqueados, http:// vira https://. As páginas recebem
// também a CSP completa, com nonce nos scripts, montada no proxy (src/lib/csp.ts).
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // O site não usa câmera direto (fotos vêm pelo seletor de arquivo), microfone, localização nem pagamento
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // Não anuncia "X-Powered-By: Next.js"
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Service worker do PWA: nunca em cache, sempre JavaScript, só scripts do próprio site
      // (vem depois: a CSP dele substitui a geral)
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
    "/u/[username]/retrospectiva.png": ["./src/assets/fonts/*.woff"],
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
