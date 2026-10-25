"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Check, Loader2, Minus, Plus, X } from "lucide-react";

type Props = {
  /** Arquivo escolhido, ou URL da imagem atual (precisa permitir CORS para o recorte) */
  source: File | string;
  /** largura / altura do recorte (1 = quadrado) */
  aspect: number;
  /** largura final em px (a altura sai do aspect) */
  outputWidth: number;
  /** Mostra a prévia redonda (foto de perfil) */
  round?: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
};

const MAX_ZOOM = 4;
const FRAME_MAX_WIDTH = 520;

/**
 * Recorte de imagem: arrasta para posicionar, zoom pela barra, rodinha do mouse
 * ou teclado (setas movem, +/- dão zoom). A imagem sempre cobre a moldura inteira.
 * Sai em JPEG, no tamanho final (`outputWidth`).
 */
export function ImageCropper({ source, aspect, outputWidth, round, title, onCancel, onConfirm }: Props) {
  const [src] = useState(() => (typeof source === "string" ? source : URL.createObjectURL(source)));
  const [error, setError] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frameW, setFrameW] = useState(FRAME_MAX_WIDTH);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const image = useRef<HTMLImageElement | null>(null);

  const frameH = frameW / aspect;

  useEffect(() => () => {
    if (typeof source !== "string") URL.revokeObjectURL(src);
  }, [src, source]);

  // Moldura acompanha a largura disponível (celular)
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFrameW(Math.min(FRAME_MAX_WIDTH, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escala base: a imagem cobre a moldura com zoom 1
  const base = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const dispW = natural ? natural.w * base * zoom : 0;
  const dispH = natural ? natural.h * base * zoom : 0;

  const clamp = useCallback(
    (p: { x: number; y: number }, w = dispW, h = dispH) => ({
      x: Math.min(0, Math.max(frameW - w, p.x)),
      y: Math.min(0, Math.max(frameH - h, p.y)),
    }),
    [dispW, dispH, frameW, frameH],
  );

  // Centraliza quando a imagem carrega ou a moldura muda de tamanho
  // (ajuste de estado durante o render: sem efeito e sem render extra com a posição errada)
  const layoutKey = natural ? `${natural.w}x${natural.h}@${frameW}` : null;
  const [centeredFor, setCenteredFor] = useState<string | null>(null);
  if (layoutKey && layoutKey !== centeredFor) {
    setCenteredFor(layoutKey);
    setPos((p) => clamp(p.x === 0 && p.y === 0 ? { x: (frameW - dispW) / 2, y: (frameH - dispH) / 2 } : p));
  }

  /** Muda o zoom mantendo o centro da moldura no mesmo ponto da imagem. */
  function applyZoom(next: number) {
    if (!natural) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const ratio = z / zoom;
    const cx = frameW / 2;
    const cy = frameH / 2;
    const w = natural.w * base * z;
    const h = natural.h * base * z;
    setZoom(z);
    setPos(clamp({ x: cx - (cx - pos.x) * ratio, y: cy - (cy - pos.y) * ratio }, w, h));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, x: pos.x, y: pos.y };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.x + e.clientX - d.startX, y: d.y + e.clientY - d.startY }));
  }
  function onPointerUp() {
    drag.current = null;
  }
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setPos((p) => clamp({ x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] }));
    } else if (e.key === "+" || e.key === "=") applyZoom(zoom * 1.1);
    else if (e.key === "-") applyZoom(zoom / 1.1);
  }

  async function confirm() {
    if (!natural || !image.current) return;
    setSaving(true);
    try {
      // Moldura → pixels da imagem original
      const scale = base * zoom;
      const sx = -pos.x / scale;
      const sy = -pos.y / scale;
      const sw = frameW / scale;
      const sh = frameH / scale;

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = Math.round(outputWidth / aspect);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/jpeg", 0.9),
      );
      await onConfirm(blob);
    } catch {
      // Imagem de um site que não permite CORS "suja" o canvas e o toBlob falha
      setError("Não conseguimos recortar essa imagem. Envie o arquivo pelo botão Enviar.");
    } finally {
      setSaving(false);
    }
  }

  // Esc fecha
  useEffect(() => {
    const onEsc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !saving && onCancel();
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [onCancel, saving]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-50">{title}</h2>
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800" aria-label="Cancelar">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div ref={wrapper} className="flex justify-center">
          <div
            tabIndex={0}
            role="application"
            aria-label="Área de recorte: arraste para posicionar, use as setas para mover e + ou - para zoom"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className="relative cursor-grab touch-none select-none overflow-hidden bg-zinc-900 outline-none ring-sky-500 focus-visible:ring-2 active:cursor-grabbing"
            style={{ width: frameW, height: frameH }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={image}
              src={src}
              crossOrigin={typeof source === "string" ? "anonymous" : undefined}
              onError={() => setError("Não conseguimos carregar essa imagem.")}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute max-w-none"
              style={{ width: dispW || undefined, height: dispH || undefined, left: pos.x, top: pos.y, visibility: natural ? "visible" : "hidden" }}
            />
            {/* Moldura: escurece o que fica fora do círculo (foto) e marca a área (capa) */}
            {round ? (
              <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/70" />
            ) : (
              <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/70" />
            )}
            {!natural && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-6 animate-spin text-zinc-500" aria-hidden />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => applyZoom(zoom / 1.2)} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800" aria-label="Diminuir zoom">
            <Minus className="size-4" aria-hidden />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="flex-1 accent-sky-500"
            aria-label="Zoom"
          />
          <button type="button" onClick={() => applyZoom(zoom * 1.2)} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800" aria-label="Aumentar zoom">
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-center text-xs text-zinc-500">Arraste para posicionar · rodinha do mouse ou a barra para zoom</p>
        {error && (
          <p role="alert" className="mt-3 text-center text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!natural || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            {saving ? "Enviando…" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
