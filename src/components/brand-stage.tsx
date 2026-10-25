import type { ReactNode } from "react";

/*
 * Tela com a arte de login (public/brand/login.jpg, 1920×1080).
 *
 * O emblema da arte fica centralizado na horizontal, com o centro a 37% da altura
 * e meia altura de 160 px (de 1080). Com `object-fit: cover` + `object-position:
 * 50% 37%`, esse ponto cai sempre a 37% da altura da tela, em qualquer formato.
 * A imagem exibida tem altura max(100vh, 56,25vw), então o emblema termina em
 * 37vh + max(14,8vh, 8,33vw): o conteúdo começa logo abaixo, centralizado com ele.
 */
const EMBLEM_CENTER_Y = "37%";
const CONTENT_TOP = "calc(37dvh + max(14.8dvh, 8.33vw) + 1rem)";

export function BrandStage({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-dvh bg-[#0c0101]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/login.jpg"
        srcSet="/brand/login-1280.jpg 1280w, /brand/login.jpg 1920w"
        sizes="max(100vw, 177.78vh)"
        alt=""
        aria-hidden
        fetchPriority="high"
        className="pointer-events-none fixed inset-0 size-full select-none object-cover"
        style={{ objectPosition: `50% ${EMBLEM_CENTER_Y}` }}
      />
      <div className="relative flex flex-col items-center px-4 pb-10" style={{ paddingTop: CONTENT_TOP }}>
        {children}
      </div>
    </main>
  );
}
