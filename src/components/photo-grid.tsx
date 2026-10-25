"use client";

import { useState } from "react";
import { Lightbox } from "./lightbox";
import { thumbOf } from "@/lib/image-urls";

/**
 * Fotos de uma publicação com a largura do card. 1 foto: inteira; 2: lado a lado;
 * 3: uma grande e duas pequenas; 4: grade 2×2. Tocar abre em tela cheia.
 */
export function PhotoGrid({ images, title }: { images: string[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;

  const button = (src: string, i: number, className: string) => (
    <button
      key={src}
      type="button"
      onClick={() => setOpen(i)}
      className={`group relative block overflow-hidden bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${className}`}
      aria-label={`Ver foto ${i + 1} de ${images.length} em tela cheia`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbOf(src)}
        alt={`Foto de ${title}`}
        loading="lazy"
        className={`size-full transition group-hover:opacity-90 ${images.length === 1 ? "object-contain" : "object-cover"}`}
      />
    </button>
  );

  return (
    <>
      {images.length === 1 ? (
        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-white/10">{button(images[0], 0, "max-h-[28rem] w-full")}</div>
      ) : (
        // O contêiner define o formato e as fotos preenchem as células (3: uma alta + duas)
        <div
          className={`mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-xl ring-1 ring-white/10 ${
            images.length === 2 ? "aspect-[8/5]" : images.length === 3 ? "aspect-[4/3] grid-rows-2" : "aspect-square grid-rows-2"
          }`}
        >
          {images.map((src, i) => button(src, i, `size-full min-h-0 ${images.length === 3 && i === 0 ? "row-span-2" : ""}`))}
        </div>
      )}
      {open !== null && <Lightbox images={images.map((full) => ({ full }))} index={open} onChange={setOpen} title={title} />}
    </>
  );
}
