"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, Loader2, Plus, Trash2, X } from "lucide-react";
import { giveBadge, revokeBadge, setUserTitle } from "@/app/(app)/_actions/awards";
import { AWARD_LIMITS, AWARD_STYLES, AWARD_SYMBOLS, type AwardStyle, type AwardSymbol, type UserTitleData } from "@/lib/awards";
import { AwardIcon } from "./award-icon";
import { AWARD_LOOK, AwardPill } from "./user-title";
import { useConfirm } from "@/components/confirm-dialog";

export type PanelBadge = { id: string; name: string; description: string | null; icon: AwardSymbol; style: AwardStyle };

/** Botão "Premiar" (só para administradores) e o painel de título e selos exclusivos do perfil. */
export function AwardPanel({ userId, username, title, badges }: { userId: string; username: string; title: UserTitleData; badges: PanelBadge[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-400/20"
      >
        <Crown className="size-4" aria-hidden /> Premiar
      </button>
      {open && <Dialog userId={userId} username={username} title={title} badges={badges} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ userId, username, title, badges, onClose }: { userId: string; username: string; title: UserTitleData; badges: PanelBadge[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const ask = useConfirm();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string, after?: () => void) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMessage({ ok: true, text: done });
        after?.();
        router.refresh();
      } else setMessage({ ok: false, text: res.message ?? "Não deu certo." });
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Premiar @${username}`} className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-zinc-50">
            <Crown className="size-5 text-amber-300" aria-hidden /> Premiar @{username}
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800" aria-label="Fechar">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* ---- Título --------------------------------------------------------- */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="font-medium text-zinc-100">Título</h3>
          <p className="mb-3 text-xs text-zinc-500">Aparece ao lado do nome no perfil e como símbolo no feed, nas listas e nos comentários. Um por perfil.</p>
          <AwardForm
            key={title ? `${title.text}-${title.icon}-${title.style}` : "sem-titulo"}
            initial={title ? { text: title.text, icon: title.icon, style: title.style, description: "" } : undefined}
            submitLabel={title ? "Trocar título" : "Dar título"}
            pending={pending}
            onSubmit={(v) => run(() => setUserTitle(userId, v), "Título salvo.")}
            extra={
              title && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => (await ask({ title: "Tirar o título deste perfil?", confirmLabel: "Tirar título" })) && run(() => setUserTitle(userId, null), "Título removido.")}
                  className="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                >
                  Tirar título
                </button>
              )
            }
          />
        </section>

        {/* ---- Selos exclusivos --------------------------------------------- */}
        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="font-medium text-zinc-100">Selos exclusivos</h3>
          <p className="mb-3 text-xs text-zinc-500">Ficam no topo do perfil, junto do título. Dá para dar vários (até 12).</p>
          {badges.length > 0 && (
            <ul className="mb-4 space-y-2">
              {badges.map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <AwardPill text={b.name} icon={b.icon} style={b.style} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{b.description}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={async () => (await ask({ title: `Tirar o selo “${b.name}”?`, confirmLabel: "Tirar selo" })) && run(() => revokeBadge(b.id), "Selo removido.")}
                    aria-label={`Tirar o selo ${b.name}`}
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-300 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AwardForm withDescription submitLabel="Dar selo" pending={pending} onSubmit={(v, reset) => run(() => giveBadge(userId, v), "Selo entregue.", reset)} />
        </section>

        {message && (
          <p role="status" className={`mt-3 text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

type FormValue = { text: string; icon: AwardSymbol; style: AwardStyle; description: string };

/** Nome + símbolo + estilo (+ descrição, nos selos), com prévia ao vivo. */
function AwardForm({
  initial,
  withDescription = false,
  submitLabel,
  pending,
  onSubmit,
  extra,
}: {
  initial?: FormValue;
  withDescription?: boolean;
  submitLabel: string;
  pending: boolean;
  /** `reset` limpa o formulário (chamado só quando deu certo) */
  onSubmit: (v: FormValue, reset: () => void) => void;
  extra?: React.ReactNode;
}) {
  const empty: FormValue = { text: "", icon: "jolly-roger", style: "crimson", description: "" };
  const [v, setV] = useState<FormValue>(initial ?? empty);
  const set = <K extends keyof FormValue>(k: K, val: FormValue[K]) => setV((x) => ({ ...x, [k]: val }));

  return (
    <div className="space-y-3">
      <input
        value={v.text}
        onChange={(e) => set("text", e.target.value)}
        maxLength={AWARD_LIMITS.title}
        placeholder={withDescription ? "Nome do selo (ex.: Caçador de Platinas)" : "Título (ex.: Rei dos Piratas)"}
        aria-label={withDescription ? "Nome do selo" : "Título"}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
      />
      {withDescription && (
        <input
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={AWARD_LIMITS.description}
          placeholder="Por que ganhou (opcional, aparece ao passar o mouse)"
          aria-label="Descrição do selo"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
        />
      )}

      <fieldset>
        <legend className="mb-1.5 text-xs uppercase tracking-wide text-zinc-500">Símbolo</legend>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {AWARD_SYMBOLS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => set("icon", s.id)}
              aria-pressed={v.icon === s.id}
              aria-label={s.label}
              title={s.label}
              className={`grid aspect-square place-items-center rounded-lg border transition ${
                v.icon === s.id ? `border-brand-500 bg-brand-500/15 ${AWARD_LOOK[v.style].icon}` : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              <AwardIcon icon={s.id} className="size-5" />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs uppercase tracking-wide text-zinc-500">Estilo</legend>
        <div className="flex flex-wrap gap-2">
          {AWARD_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => set("style", s.id)}
              aria-pressed={v.style === s.id}
              className={`rounded-full p-0.5 ring-2 transition ${v.style === s.id ? "ring-brand-500" : "ring-transparent hover:ring-zinc-700"}`}
            >
              <AwardPill text={s.label} icon={v.icon} style={s.id} size="xs" />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-zinc-800 p-3">
        <span className="text-xs text-zinc-500">Prévia</span>
        <AwardPill text={v.text.trim() || (withDescription ? "Nome do selo" : "Seu título")} icon={v.icon} style={v.style} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !v.text.trim()}
          onClick={() => onSubmit(v, () => setV(empty))}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {submitLabel}
        </button>
        {extra}
      </div>
    </div>
  );
}
