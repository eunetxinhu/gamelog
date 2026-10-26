"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSteamSync } from "../settings/profile/_components/use-steam-sync";

/**
 * Sincroniza a Steam em segundo plano quando a pessoa abre o site e a última
 * sincronização está velha (o layout decide). Só enfileira (responde na hora); a fila
 * faz o trabalho em etapas. Quando termina com novidade no feed, atualiza a página.
 */
export function SteamAutoSync() {
  const router = useRouter();
  const started = useRef(false);
  const refreshed = useRef(false);
  const sync = useSteamSync({ pollMs: 4000, maxMs: 3 * 60_000 });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Voltando do "Entrar com Steam": a página de Contas vinculadas já sincroniza
    if (new URLSearchParams(window.location.search).get("steam") === "linked") return;
    void sync.start("AUTO"); // silencioso: Contas vinculadas mostra os erros
  }, [sync]);

  const posted = sync.view?.status === "DONE" ? sync.view.result?.posted : null;
  useEffect(() => {
    if (!refreshed.current && posted && (posted.platinums > 0 || posted.started > 0 || posted.rare > 0)) {
      refreshed.current = true;
      router.refresh();
    }
  }, [posted, router]);

  return null;
}
