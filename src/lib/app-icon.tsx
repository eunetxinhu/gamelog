import { ImageResponse } from "next/og";

/**
 * Ícone do Poneglyph.gg desenhado em código (sem arquivos de imagem no repositório).
 * `maskable` deixa uma margem de segurança: o Android recorta o ícone em círculo/gota.
 */
export function appIcon(size: number, { maskable = false, rounded = true } = {}) {
  const inner = maskable ? size * 0.62 : size * 0.8;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #d41b26, #43040a)",
          borderRadius: rounded && !maskable ? size * 0.22 : 0,
        }}
      >
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {/* troféu */}
          <path d="M8 21h8" />
          <path d="M12 17v4" />
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" fill="rgba(255,255,255,0.18)" />
          <path d="M17 6h2.5a1.5 1.5 0 0 1 0 3H17" />
          <path d="M7 6H4.5a1.5 1.5 0 0 0 0 3H7" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
