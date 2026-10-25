"use client";

import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import { steamCoverUrl, steamHeaderUrl } from "@/lib/steam/assets";

type Props = {
  title: string;
  coverUrl: string | null;
  steamAppId?: number | null;
  className?: string;
};

/**
 * Capa do jogo, sempre em retrato (3:4).
 * Tenta, em ordem: capa salva → capa vertical da Steam → banner da Steam → placeholder.
 * Muitos jogos antigos não têm a capa 600x900, então o fallback é automático.
 */
export function GameCover({ title, coverUrl, steamAppId, className = "" }: Props) {
  const sources = [coverUrl, steamAppId ? steamCoverUrl(steamAppId) : null, steamAppId ? steamHeaderUrl(steamAppId) : null].filter(
    (src, i, all): src is string => Boolean(src) && all.indexOf(src) === i,
  );
  const [index, setIndex] = useState(0);
  const src = sources[index];

  return (
    <div className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={title}
          loading="lazy"
          onError={() => setIndex((i) => i + 1)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center">
          <Gamepad2 className="size-6 text-zinc-500" aria-hidden />
          <span className="line-clamp-3 text-xs font-medium text-zinc-400">{title}</span>
        </div>
      )}
    </div>
  );
}
