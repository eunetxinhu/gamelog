"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Chave interna (nome antigo do site); trocar faria o aviso de instalação reaparecer para todo mundo.
const DISMISS_KEY = "gamelog:install-dismissed";

/**
 * Registra o service worker (só em produção) e mostra um aviso discreto para instalar
 * o app: botão nos navegadores que suportam (Chrome/Edge/Android) e instruções no iPhone.
 */
/** Onde estamos: já instalado/dispensado (não mostra), iPhone (instruções) ou outro (botão). */
function installEnv(): "hidden" | "ios" | "other" {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // armazenamento bloqueado: mostra normalmente
  }
  if (standalone || dismissed) return "hidden";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent) ? "ios" : "other";
}
const noSubscribe = () => () => {};

export function Pwa() {
  const env = useSyncExternalStore(noSubscribe, installEnv, () => "hidden" as const);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [closed, setHidden] = useState(false);
  const ios = env === "ios";
  const hidden = closed || env === "hidden";

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    if (env !== "other") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [env]);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sem armazenamento: só esconde nesta visita
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setHidden(true);
    setInstallEvent(null);
  }

  if (hidden || (!installEvent && !ios)) return null;

  return (
    <div role="dialog" aria-label="Instalar o Poneglyph.gg" className="fixed inset-x-3 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-40 mx-auto md:bottom-3 flex max-w-md items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/192" alt="" className="size-10 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-zinc-50">Instale o Poneglyph.gg</p>
        {ios ? (
          <p className="text-xs text-zinc-400">
            Toque em <Share className="inline size-3.5 align-text-bottom" aria-label="Compartilhar" /> e depois em “Adicionar à Tela de Início”.
          </p>
        ) : (
          <p className="text-xs text-zinc-400">Abra direto da tela inicial, como um app.</p>
        )}
      </div>
      {!ios && (
        <button type="button" onClick={install} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500">
          <Download className="size-4" aria-hidden /> Instalar
        </button>
      )}
      <button type="button" onClick={dismiss} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="Agora não">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
