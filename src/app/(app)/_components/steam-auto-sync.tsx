"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncSteamLibrary } from "../settings/profile/_actions/steam";

/**
 * Sincroniza a Steam em segundo plano quando o usuário abre o site e a última
 * sincronização está velha (o layout decide isso). É o que faz platinas e
 * jogos novos aparecerem no feed sem precisar clicar em "Sincronizar".
 */
export function SteamAutoSync() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Voltando do "Entrar com Steam": a página de Contas vinculadas já sincroniza
    if (new URLSearchParams(window.location.search).get("steam") === "linked") return;
    syncSteamLibrary()
      .then((res) => {
        if (res.ok && (res.data.posted.platinums > 0 || res.data.posted.started > 0 || res.data.posted.rare > 0)) router.refresh();
      })
      .catch(() => {}); // silencioso: o botão em Contas vinculadas mostra os erros
  }, [router]);

  return null;
}
