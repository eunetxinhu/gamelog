"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncJobView } from "@/lib/jobs/queue";
import { getSteamSyncStatus, startSteamSync } from "../_actions/steam";
import type { SteamSyncError } from "../_actions/types";

const ACTIVE = new Set(["QUEUED", "RUNNING"]);

/**
 * Pede a sincronização (responde na hora) e acompanha o job até terminar,
 * consultando a situação a cada `pollMs`. Para sozinho ao desmontar.
 */
export function useSteamSync({ pollMs = 1500, maxMs = 6 * 60_000 }: { pollMs?: number; maxMs?: number } = {}) {
  const [view, setView] = useState<SyncJobView | null>(null);
  const [startError, setStartError] = useState<SteamSyncError | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const follow = useCallback(
    (jobId: string, since = Date.now()) => {
      const tick = async () => {
        const v = await getSteamSyncStatus(jobId).catch(() => null);
        if (!alive.current) return;
        if (v) setView(v);
        if (v && !ACTIVE.has(v.status)) return;
        if (Date.now() - since > maxMs) return; // a fila continua; a tela só para de perguntar
        timer.current = setTimeout(tick, pollMs);
      };
      void tick();
    },
    [pollMs, maxMs],
  );

  const start = useCallback(
    async (trigger: "MANUAL" | "AUTO" = "MANUAL") => {
      if (timer.current) clearTimeout(timer.current);
      setStarting(true);
      setStartError(null);
      setView(null);
      const res = await startSteamSync(trigger).catch(() => ({
        ok: false as const,
        error: { code: "UNKNOWN" as const, message: "Sem conexão com o site. Tente de novo." },
      }));
      if (!alive.current) return null;
      setStarting(false);
      if (!res.ok) {
        setStartError(res.error);
        return null;
      }
      follow(res.jobId);
      return res.jobId;
    },
    [follow],
  );

  /** Abriu a página com uma sincronização ainda andando: volta a acompanhar. */
  const resume = useCallback(async () => {
    const v = await getSteamSyncStatus().catch(() => null);
    if (alive.current && v && ACTIVE.has(v.status)) {
      setView(v);
      follow(v.id);
    }
  }, [follow]);

  const running = starting || (view !== null && ACTIVE.has(view.status));
  const clear = useCallback(() => {
    setView(null);
    setStartError(null);
  }, []);
  return { view, startError, running, start, resume, clear };
}
