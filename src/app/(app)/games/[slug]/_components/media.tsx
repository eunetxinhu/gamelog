"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { ScrollRow } from "@/components/scroll-row";
import { Lightbox } from "@/components/lightbox";

export type Screenshot = { thumb: string; full: string };
export type Trailer = { name: string; thumb: string; hls: string };

/** Trailer (HLS da Steam) + galeria de screenshots com visualização em tela cheia. */
export function GameMedia({ title, trailers, screenshots }: { title: string; trailers: Trailer[]; screenshots: Screenshot[] }) {
  const [trailer, setTrailer] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold text-zinc-50">Trailers e imagens</h2>

      {trailers.length > 0 && (
        <>
          <TrailerPlayer key={trailers[trailer].hls} trailer={trailers[trailer]} />
          {trailers.length > 1 && (
            <div className="mt-2">
            {/* py-1: espaço para o contorno do trailer selecionado não ser cortado */}
            <ScrollRow label="Trailers" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-1">
              {trailers.map((t, i) => (
                <li key={t.hls} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setTrailer(i)}
                    className={`relative block w-36 overflow-hidden sm:w-40 rounded-lg ring-2 transition ${i === trailer ? "ring-brand-500" : "ring-transparent hover:ring-zinc-600"}`}
                    title={t.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.thumb} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-left text-[11px] text-zinc-200">{t.name}</span>
                  </button>
                </li>
              ))}
            </ScrollRow>
            </div>
          )}
        </>
      )}

      {screenshots.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {screenshots.map((s, i) => (
            <li key={s.full}>
              <button type="button" onClick={() => setViewer(i)} className="block w-full overflow-hidden rounded-lg ring-1 ring-white/10 transition hover:ring-brand-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.thumb} alt={`${title}: imagem ${i + 1}`} className="aspect-video w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewer !== null && <Lightbox images={screenshots} index={viewer} onChange={setViewer} title={title} />}
    </section>
  );
}

/**
 * A Steam só entrega trailers em HLS (.m3u8). O Safari toca nativo; nos outros
 * navegadores o hls.js é carregado sob demanda, só quando a pessoa aperta play.
 */
function TrailerPlayer({ trailer }: { trailer: Trailer }) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started || !video.current) return;
    const el = video.current;
    let destroy: (() => void) | undefined;

    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = trailer.hls;
      el.play().catch(() => {});
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) return;
        const hls = new Hls({ capLevelToPlayerSize: true });
        hls.loadSource(trailer.hls);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
        destroy = () => hls.destroy();
      });
    }
    return () => destroy?.();
  }, [started, trailer.hls]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      {started ? (
        <video ref={video} controls playsInline className="size-full" aria-label={trailer.name} />
      ) : (
        <button type="button" onClick={() => setStarted(true)} className="group relative block size-full" aria-label={`Assistir: ${trailer.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={trailer.thumb.replace(/movie\.\d+x\d+\.jpg/, "movie_max.jpg")} alt="" className="size-full object-cover opacity-80 transition group-hover:opacity-100" onError={(e) => (e.currentTarget.src = trailer.thumb)} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-brand-600/90 text-white shadow-xl transition group-hover:scale-110">
              <Play className="ml-1 size-7 fill-white" aria-hidden />
            </span>
          </span>
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-left text-sm font-medium text-white">{trailer.name}</span>
        </button>
      )}
    </div>
  );
}
