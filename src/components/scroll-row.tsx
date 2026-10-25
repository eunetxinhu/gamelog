"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Fileira com rolagem lateral e barra de progresso no estilo "loading" de jogo
 * (no lugar da barra de rolagem do sistema). A barra é arrastável e, no computador,
 * há setas para avançar. Quando tudo cabe na tela, barra e setas somem.
 */
export function ScrollRow({ className = "", children, label }: { className?: string; children: ReactNode; label?: string }) {
  const list = useRef<HTMLUListElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ ratio: 1, pos: 0 });
  const listId = useId();

  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setView({ ratio: el.scrollWidth ? el.clientWidth / el.scrollWidth : 1, pos: max > 0 ? el.scrollLeft / max : 0 });
  }, []);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [measure]);

  const overflow = view.ratio < 0.999;

  function page(dir: 1 | -1) {
    const el = list.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }

  // Clicar ou arrastar na barra posiciona a fileira (o centro da barra acompanha o dedo)
  function seek(e: PointerEvent<HTMLDivElement>) {
    const el = list.current;
    const box = track.current?.getBoundingClientRect();
    if (!el || !box) return;
    const x = (e.clientX - box.left) / box.width - view.ratio / 2;
    el.scrollLeft = Math.min(1, Math.max(0, x / (1 - view.ratio))) * (el.scrollWidth - el.clientWidth);
  }

  return (
    <div className="group/row relative">
      <ul ref={list} id={listId} className={`scrollbar-none ${className}`} aria-label={label}>
        {children}
      </ul>

      {overflow && (
        <>
          <Arrow side="left" hidden={view.pos <= 0.001} onClick={() => page(-1)} />
          <Arrow side="right" hidden={view.pos >= 0.999} onClick={() => page(1)} />

          <div
            ref={track}
            role="scrollbar"
            aria-controls={listId}
            aria-orientation="horizontal"
            aria-valuenow={Math.round(view.pos * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label ? `Rolar ${label}` : "Rolar"}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seek(e);
            }}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && seek(e)}
            className="relative mt-2 h-1.5 cursor-pointer touch-none overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-white/5 transition-[height] hover:h-2.5"
          >
            <div
              className="loading-bar absolute inset-y-0 rounded-full"
              style={{ width: `${view.ratio * 100}%`, left: `${view.pos * (1 - view.ratio) * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Arrow({ side, hidden, onClick }: { side: "left" | "right"; hidden: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={-1}
      aria-hidden
      className={`absolute top-[40%] z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-400/40 bg-zinc-950/90 text-brand-300 shadow-[0_0_16px_rgba(56,189,248,0.35)] backdrop-blur transition hover:scale-110 hover:text-white md:flex ${
        side === "left" ? "-left-3" : "-right-3"
      } ${hidden ? "pointer-events-none opacity-0" : "opacity-0 group-hover/row:opacity-100"}`}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
