import type { ReactNode } from "react";

/*
 * Tela com a arte de login (public/brand/login.jpg, 1920×1080). As medidas ficam em
 * globals.css (.brand-stage-*):
 *
 * - O emblema está centralizado na horizontal, com o centro a 39% da altura da arte
 *   (y = 420 de 1080) e a base a 53,9% (y = 582).
 * - Tela deitada: a arte cobre tudo (`cover` + `object-position: 50% 39%`), então o
 *   emblema fica sempre a 39% da altura da tela e termina em 39vh + max(15vh, 8,44vw).
 * - Tela em pé (celular): a arte ocupa só os 72% de cima e some num degradê, para o
 *   emblema ficar menor e mais alto e sobrar espaço para a caixa.
 * Trocou a arte? Meça de novo o centro e a base do emblema e ajuste os números.
 */
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
        className="brand-stage-art pointer-events-none select-none"
      />
      <div className="brand-stage-content relative flex flex-col items-center px-4 pb-10">{children}</div>
    </main>
  );
}
