"use client";

import { useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";

/** Baixar o cartaz ou mandar pelo menu "Compartilhar" do celular (com o arquivo da imagem). */
export function SharePoster({ src, filename, text }: { src: string; filename: string; text: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getFile() {
    const res = await fetch(src);
    if (!res.ok) throw new Error("falhou");
    return new File([await res.blob()], filename, { type: "image/png" });
  }

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const file = await getFile();
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else download(file);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError("Não deu para compartilhar. Tente baixar.");
    } finally {
      setBusy(false);
    }
  }

  function download(file?: File) {
    const a = document.createElement("a");
    const url = file ? URL.createObjectURL(file) : src;
    a.href = url;
    a.download = filename;
    a.click();
    if (file) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Share2 className="size-4" aria-hidden />} Compartilhar
      </button>
      <button
        type="button"
        onClick={() => download()}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
      >
        <Download className="size-4" aria-hidden /> Baixar
      </button>
      {error && (
        <p role="alert" className="w-full text-center text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
