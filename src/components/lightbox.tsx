"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/** Imagem em tela cheia com setas, teclado (Esc, ← →) e arrastar para o lado no celular. */
export function Lightbox({
  images,
  index,
  onChange,
  title,
}: {
  images: { full: string }[];
  index: number;
  onChange: (i: number | null) => void;
  title: string;
}) {
  const prev = () => onChange((index - 1 + images.length) % images.length);
  const next = () => onChange((index + 1) % images.length);
  // Arrastar para o lado no celular troca de imagem
  const touchX = useRef<number | null>(null);
  const SWIPE_PX = 50;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onChange(null);
      if (e.key === "ArrowLeft") onChange((index - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") onChange((index + 1) % images.length);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, images.length, onChange]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title}: imagem ${index + 1} de ${images.length}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={() => onChange(null)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null || images.length < 2) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > SWIPE_PX) (dx > 0 ? prev : next)();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[index].full} alt={`${title}: imagem ${index + 1}`} className="max-h-full max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={() => onChange(null)} className="absolute right-4 top-4 rounded-full bg-zinc-900/80 p-2 text-zinc-200 hover:bg-zinc-800" aria-label="Fechar">
        <X className="size-5" aria-hidden />
      </button>
      {images.length > 1 && (
        <>
          <button type="button" onClick={(e) => {
              e.stopPropagation();
              prev();
            }} className="absolute left-4 rounded-full bg-zinc-900/80 p-2 text-zinc-200 hover:bg-zinc-800" aria-label="Anterior">
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button type="button" onClick={(e) => {
              e.stopPropagation();
              next();
            }} className="absolute right-4 rounded-full bg-zinc-900/80 p-2 text-zinc-200 hover:bg-zinc-800" aria-label="Próxima">
            <ChevronRight className="size-6" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
