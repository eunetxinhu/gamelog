"use client";

import type { ReactNode } from "react";
import { ExternalLink, EyeOff, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import type { SteamPrivacyReason } from "../_actions/types";

const STEAM_PRIVACY_URL = "https://steamcommunity.com/my/edit/settings";

type Props = {
  reason: SteamPrivacyReason;
  onRetry: () => void;
  retrying: boolean;
};

/**
 * Aviso exibido quando a Server Action retorna STEAM_PRIVATE.
 * Explica o porquê e ensina, passo a passo, a liberar os dados na Steam.
 */
export function SteamPrivacyNotice({ reason, onRetry, retrying }: Props) {
  const profilePrivate = reason === "PROFILE";

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h4 className="font-semibold text-amber-200">
            {profilePrivate ? "Seu perfil Steam está privado" : "Os detalhes dos seus jogos estão privados"}
          </h4>
          <p className="text-sm text-amber-100/80">
            Sua conta foi vinculada, mas a Steam não nos deixa ver sua biblioteca nem as horas jogadas.
            Isso é uma configuração de privacidade da sua conta — leva menos de um minuto para ajustar.
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-3 text-sm text-zinc-200">
        <Step n={1}>
          Na Steam, clique no seu nome → <Kbd>Ver meu perfil</Kbd> → <Kbd>Editar perfil</Kbd> →{" "}
          <Kbd>Configurações de privacidade</Kbd>. Ou use o atalho abaixo.
        </Step>

        <Step n={2} highlight={profilePrivate}>
          Em <strong>Meu perfil</strong>, selecione <Kbd>Público</Kbd>.
          {profilePrivate && (
            <span className="mt-1 block text-xs text-amber-300/90">
              ← É isso que está bloqueando agora. Os detalhes dos jogos nunca podem ser mais abertos que o perfil.
            </span>
          )}
        </Step>

        <Step n={3} highlight={!profilePrivate}>
          Em <strong>Detalhes dos jogos</strong>, selecione <Kbd>Público</Kbd>.
          {!profilePrivate && (
            <span className="mt-1 block text-xs text-amber-300/90">← É isso que está bloqueando agora.</span>
          )}
        </Step>

        <Step n={4}>
          Desmarque a opção <em>“Sempre manter meu tempo total de jogo privado…”</em>, logo abaixo — senão seus
          jogos aparecem com 0 horas.
        </Step>

        <Step n={5}>As alterações salvam sozinhas. Volte aqui e clique em “Tentar novamente”.</Step>
      </ol>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <a
          href={STEAM_PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1b2838] px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-[#2a475e]"
        >
          Abrir configurações de privacidade
          <ExternalLink className="size-4" aria-hidden />
        </a>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          Já alterei, tentar novamente
        </button>
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        Pode levar alguns minutos até a Steam liberar os dados depois da mudança. Só lemos a lista de jogos e as horas
        jogadas — nunca sua senha, inventário ou carteira.
      </p>
    </div>
  );
}

/**
 * Biblioteca veio, mas com 0 h em tudo: "Sempre manter meu tempo total de jogo privado"
 * está marcado na Steam. As platinas continuam sendo conferidas; as horas, não.
 */
export function PlaytimeHiddenNotice({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <EyeOff className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h4 className="font-semibold text-amber-200">Seu tempo de jogo está oculto na Steam</h4>
          <p className="text-sm text-amber-100/80">
            Seus jogos chegaram, mas todos com 0 horas. As platinas continuam sendo conferidas, mas as horas só aparecem
            quando você liberar.
          </p>
        </div>
      </div>
      <ol className="mt-4 space-y-3 text-sm text-zinc-200">
        <Step n={1}>
          Abra as <Kbd>Configurações de privacidade</Kbd> do seu perfil na Steam (atalho abaixo).
        </Step>
        <Step n={2} highlight>
          Em <strong>Detalhes dos jogos</strong>, desmarque <em>“Sempre manter meu tempo total de jogo privado…”</em>.
        </Step>
        <Step n={3}>Volte aqui e sincronize de novo.</Step>
      </ol>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <a
          href={STEAM_PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1b2838] px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-[#2a475e]"
        >
          Abrir configurações de privacidade
          <ExternalLink className="size-4" aria-hidden />
        </a>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          Já alterei, sincronizar
        </button>
      </div>
    </div>
  );
}

function Step({ n, highlight, children }: { n: number; highlight?: boolean; children: ReactNode }) {
  return (
    <li
      className={`flex gap-3 rounded-lg p-2 ${highlight ? "bg-amber-400/10 ring-1 ring-amber-400/40" : ""}`}
    >
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          highlight ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"
        }`}
        aria-hidden
      >
        {n}
      </span>
      <span className="min-w-0 leading-relaxed">{children}</span>
    </li>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-md bg-zinc-800 px-1.5 py-0.5 font-medium text-zinc-100 ring-1 ring-white/10">
      {children}
    </span>
  );
}
