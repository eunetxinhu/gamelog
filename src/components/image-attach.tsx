"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadMedia } from "@/app/(app)/_actions/media";
import { shrinkImage } from "@/lib/image-shrink";

/**
 * Botão "Adicionar foto": reduz a imagem no navegador, envia e devolve a URL.
 * Mostra a prévia com um X para remover.
 */
export function ImageAttach({
  kind,
  value,
  onChange,
  compact,
}: {
  kind: "post" | "club" | "dm";
  value: string | null;
  onChange: (url: string | null) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Escolha um arquivo de imagem.");
    setError(null);
    startTransition(async () => {
      try {
        const blob = await shrinkImage(file);
        const data = new FormData();
        data.set("kind", kind);
        data.set("file", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        const res = await uploadMedia(data);
        if (res.ok) onChange(res.url);
        else setError(res.message);
      } catch {
        setError("Não conseguimos ler essa imagem.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {value && (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Foto anexada" className="max-h-48 rounded-lg ring-1 ring-white/10" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-black"
            aria-label="Remover foto"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {!value && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          className={`inline-flex items-center gap-1.5 rounded-lg text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50 ${
            compact ? "p-2" : "border border-zinc-700 px-3 py-1.5"
          }`}
          aria-label="Adicionar foto"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          {!compact && (pending ? "Enviando…" : "Adicionar foto")}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => onPick(e.target.files?.[0])} />
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
