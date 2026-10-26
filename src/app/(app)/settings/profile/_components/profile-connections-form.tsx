"use client";

import { useEffect, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Gamepad2, Loader2, LogIn, RefreshCw, Unlink } from "lucide-react";
import { syncSteamLibrary, unlinkSteam } from "../_actions/steam";
import type { SteamSyncError, SteamSyncResult } from "../_actions/types";
import { PlaytimeHiddenNotice, SteamPrivacyNotice } from "./steam-privacy-notice";
import { useConfirm } from "@/components/confirm-dialog";

/** Rota que inicia o "Entrar com Steam" (login oficial, OpenID 2.0). */
const STEAM_LOGIN_HREF = "/api/steam/login";

// -----------------------------------------------------------------------------
//  Props (montadas no Server Component page.tsx)
// -----------------------------------------------------------------------------

export type ProfileConnectionsProps = {
  steam: {
    steamId: string | null;
    personaName: string | null;
    avatarUrl: string | null;
    lastSyncAt: string | null; // ISO
    gamesCount: number;
    totalHours: number;
    /** Biblioteca com 0 minutos em todos os jogos (tempo de jogo oculto na Steam) */
    playtimeHidden: boolean;
  };
  /** Acabou de voltar do login da Steam com sucesso (?steam=linked) */
  justLinked: boolean;
  /** Erro devolvido pelo login da Steam (?steam_error=CODE) */
  linkError: SteamSyncError | null;
};

export function ProfileConnectionsForm(props: ProfileConnectionsProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <SteamCard {...props} />
    </div>
  );
}

// =============================================================================
//  Steam
// =============================================================================

function SteamCard({ steam: initial, justLinked, linkError }: ProfileConnectionsProps) {
  const linked = Boolean(initial.steamId);
  const [result, setResult] = useState<SteamSyncResult | null>(linkError ? { ok: false, error: linkError } : null);
  const [pending, startTransition] = useTransition();
  const [unlinking, startUnlink] = useTransition();
  const autoSynced = useRef(false);
  const ask = useConfirm();

  function runSync() {
    startTransition(async () => {
      setResult(await syncSteamLibrary());
    });
  }

  // Voltou do "Entrar com Steam": sincroniza sozinho e limpa a query da URL
  // (sem refazer o request), para um F5 não disparar de novo.
  useEffect(() => {
    if (justLinked && !autoSynced.current) {
      autoSynced.current = true;
      runSync();
    }
    if (justLinked || linkError) window.history.replaceState(null, "", "/settings/profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUnlink() {
    const sure = await ask({
      title: "Desvincular a Steam?",
      description: "Os jogos importados saem da sua biblioteca. Seus registros, notas e reviews ficam.",
      confirmLabel: "Desvincular",
    });
    if (!sure) return;
    startUnlink(async () => {
      const res = await unlinkSteam();
      if (!res.ok && res.message) return void ask({ title: "Não deu para desvincular", description: res.message, notice: true });
      setResult(null);
    });
  }

  const error = result && !result.ok ? result.error : null;
  const success = result?.ok ? result.data : null;
  const busy = pending || unlinking;

  // Dados exibidos: o resultado mais recente tem prioridade sobre as props
  const persona = success?.personaName ?? initial.personaName;
  const avatar = success?.avatarUrl ?? initial.avatarUrl;
  const gamesCount = success?.totalGames ?? initial.gamesCount;
  const totalHours = success?.totalHours ?? initial.totalHours;
  const lastSync = success?.syncedAt ?? initial.lastSyncAt;
  const hiddenPlaytime = linked && !error && (success ? success.playtimeHidden : initial.playtimeHidden);

  return (
    <Card
      icon={<Gamepad2 className="size-5" aria-hidden />}
      title="Steam"
      description="Importe sua biblioteca e as horas jogadas para preencher seu perfil automaticamente."
    >
      {/* ---- Conta vinculada ---------------------------------------------- */}
      {linked && (
        <div className="space-y-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="size-12 rounded-lg ring-1 ring-white/10" />
              ) : (
                <div className="size-12 rounded-lg bg-zinc-800" />
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-100">{persona ?? "Conta Steam"}</p>
                <p className="text-sm text-zinc-400">
                  {gamesCount.toLocaleString("pt-BR")} jogos · {totalHours.toLocaleString("pt-BR")} h jogadas
                </p>
                <p className="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="size-3" aria-hidden />
                  {lastSync ? `Sincronizado ${relativeTime(lastSync)}` : "Ainda não sincronizado"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button onClick={runSync} disabled={busy} variant="primary">
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                {pending ? "Sincronizando…" : "Sincronizar agora"}
              </Button>
              <LinkButton href={STEAM_LOGIN_HREF} disabled={busy}>
                Trocar conta
              </LinkButton>
              <Button onClick={onUnlink} disabled={busy} variant="danger" aria-label="Desvincular Steam">
                {unlinking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Unlink className="size-4" aria-hidden />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Para trocar, entre com a outra conta no site da Steam. Se ela abrir já logada na conta atual, saia dela lá
            primeiro.
          </p>
          <p className="text-xs text-zinc-500">
            <strong className="font-medium text-zinc-400">Jogos da Família Steam:</strong> os que você jogou nas últimas 2
            semanas entram sozinhos. Para os mais antigos, abra o jogo em Jogos e registre (Jogando, Finalizado ou
            Platinado): na próxima sincronização conferimos suas conquistas nele.
          </p>
        </div>
      )}

      {/* ---- Não vinculada: login oficial ---------------------------------- */}
      {!linked && (
        <div className="space-y-2">
          <LinkButton href={STEAM_LOGIN_HREF} variant="steam" disabled={busy}>
            <LogIn className="size-4" aria-hidden />
            Entrar com Steam
          </LinkButton>
          <p className="text-xs text-zinc-500">
            Você faz login no site oficial da Steam e ela nos diz qual é a sua conta. Não recebemos sua senha.
          </p>
        </div>
      )}

      {/* ---- Feedback ------------------------------------------------------ */}
      <div className="mt-4 space-y-3 empty:hidden">
        {error?.code === "STEAM_PRIVATE" && (
          <SteamPrivacyNotice reason={error.privacyReason ?? "GAME_DETAILS"} onRetry={runSync} retrying={pending} />
        )}

        {hiddenPlaytime && <PlaytimeHiddenNotice onRetry={runSync} retrying={pending} />}

        {error && (error.code === "SYNC_COOLDOWN" || error.code === "STEAM_LOGIN_CANCELLED") && (
          <Alert tone="info" icon={<Clock className="size-4" aria-hidden />}>
            {error.message}
          </Alert>
        )}

        {error && !["STEAM_PRIVATE", "SYNC_COOLDOWN", "STEAM_LOGIN_CANCELLED"].includes(error.code) && (
          <Alert tone="error" icon={<AlertTriangle className="size-4" aria-hidden />}>
            {error.message}
          </Alert>
        )}

        {success && (
          <Alert tone="success" icon={<CheckCircle2 className="size-4" aria-hidden />}>
            <p>
              Biblioteca sincronizada: <strong>{success.newGames}</strong> novos, <strong>{success.updatedGames}</strong>{" "}
              atualizados
              {success.removedGames > 0 && (
                <>
                  , <strong>{success.removedGames}</strong> removidos
                </>
              )}
              .
            </p>
            {(success.posted.platinums > 0 || success.posted.started > 0) && (
              <p className="mt-1">
                Publicado no feed:{" "}
                {[
                  success.posted.platinums > 0 && `${success.posted.platinums} platina(s) 🏆`,
                  success.posted.started > 0 && `${success.posted.started} jogo(s) novo(s)`,
                ]
                  .filter(Boolean)
                  .join(" e ")}
                .
              </p>
            )}
            {success.pendingAchievementChecks > 0 && (
              <p className="mt-1 text-emerald-200/80">
                Ainda faltam conferir as conquistas de {success.pendingAchievementChecks.toLocaleString("pt-BR")} jogo(s): as
                platinas deles vão aparecendo sozinhas nas próximas sincronizações.
              </p>
            )}
            {success.recentlyPlayed.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {success.recentlyPlayed.map((g) => (
                  <li key={g.appId} className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-200">
                    {g.name} · {g.hours2Weeks.toLocaleString("pt-BR")} h nas últimas 2 semanas
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
      </div>
    </Card>
  );
}

// =============================================================================
//  UI primitives
// =============================================================================

function Card(props: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-xl shadow-black/20 sm:p-6">
      <header className="mb-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-zinc-800 p-2 text-zinc-200">{props.icon}</div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">{props.title}</h3>
            <p className="text-sm text-zinc-400">{props.description}</p>
          </div>
        </div>
      </header>
      {props.children}
    </section>
  );
}

type Variant = "primary" | "ghost" | "danger" | "steam";

function buttonClass(variant: Variant, className = "") {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-500",
    ghost: "border border-zinc-700 text-zinc-200 hover:bg-zinc-800",
    danger: "border border-red-900/60 text-red-300 hover:bg-red-950/50",
    steam: "bg-[#1b2838] text-white ring-1 ring-white/10 hover:bg-[#2a475e]",
  }[variant];
  return `inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ${styles} ${className}`;
}

function Button({
  variant = "ghost",
  className = "",
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

/** Link com cara de botão (navegação de página inteira para o login da Steam). */
function LinkButton({
  variant = "ghost",
  className = "",
  disabled,
  ...rest
}: ComponentProps<"a"> & { variant?: Variant; disabled?: boolean }) {
  return <a aria-disabled={disabled || undefined} className={buttonClass(variant, className)} {...rest} />;
}

function Alert({ tone, icon, children }: { tone: "success" | "error" | "info"; icon: ReactNode; children: ReactNode }) {
  const styles = {
    success: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100",
    error: "border-red-500/30 bg-red-500/[0.07] text-red-100",
    info: "border-brand-500/30 bg-brand-500/[0.07] text-brand-100",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-lg border p-3 text-sm ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function relativeTime(iso: string) {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}
