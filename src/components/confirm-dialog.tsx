"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

/** Resultado padrão das ações chamadas por uma confirmação (as Server Actions de excluir seguem isto). */
export type ConfirmActionResult = { ok: boolean; message?: string };

export type ConfirmOptions = {
  title: string;
  /** Explicação do que acontece (o que some, se dá para desfazer) */
  description?: ReactNode;
  confirmLabel?: string;
  /** Vermelho, para excluir/bloquear/suspender. Padrão: true */
  danger?: boolean;
  /** Só avisa (um botão "Ok", sem "Cancelar"): substitui o alert() do navegador */
  notice?: boolean;
  /**
   * Ação executada dentro da janela: mostra "carregando", e se falhar a janela continua
   * aberta com a mensagem de erro (em vez de falhar em silêncio).
   */
  action?: () => Promise<ConfirmActionResult | void>;
};

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * Confirmação no visual do site, no lugar do `confirm()` do navegador.
 *
 *   const ask = useConfirm();
 *   if (await ask({ title: "Apagar esta lista?", action: () => deleteList(id) })) router.replace("/listas");
 *
 * Devolve `true` só quando a pessoa confirmou **e** a ação deu certo.
 */
export function useConfirm(): Ask {
  return useContext(ConfirmContext) ?? fallbackAsk;
}

/** Fora do <ConfirmProvider> (páginas fora do app): cai no confirm()/alert() do navegador. */
const fallbackAsk: Ask = async (options) => {
  if (options.notice) {
    window.alert([options.title, typeof options.description === "string" ? options.description : ""].filter(Boolean).join("\n\n"));
    return true;
  }
  if (!window.confirm(options.title)) return false;
  if (!options.action) return true;
  const res = await options.action().catch(() => ({ ok: false }));
  return !res || res.ok;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Pending | null>(null);

  const ask = useCallback<Ask>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setCurrent({ ...options, resolve });
      }),
    [],
  );

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {current && (
        <ConfirmDialog
          key={current.title}
          options={current}
          onClose={(ok) => {
            current.resolve(ok);
            setCurrent(null);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const danger = options.notice ? false : (options.danger ?? true);

  // <dialog> nativo: prende o foco, fecha com Esc e escurece o fundo
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function onConfirm() {
    if (!options.action) return onClose(true);
    setRunning(true);
    setError(null);
    try {
      const res = await options.action();
      if (res && !res.ok) {
        setError(res.message ?? "Não deu certo. Tente de novo.");
        setRunning(false);
        return;
      }
      onClose(true);
    } catch {
      setError("Sem conexão com o site. Confira a internet e tente de novo.");
      setRunning(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby={options.description ? "confirm-desc" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!running) onClose(false);
      }}
      onClick={(e) => {
        // Clique fora do cartão fecha (o alvo é o próprio <dialog>, que cobre a tela)
        if (e.target === ref.current && !running) onClose(false);
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400" aria-hidden>
              <AlertTriangle className="size-5" />
            </span>
          )}
          <div className="min-w-0 space-y-1.5">
            <h2 id="confirm-title" className="text-lg font-semibold text-zinc-50">
              {options.title}
            </h2>
            {options.description && (
              <div id="confirm-desc" className="text-sm leading-relaxed text-zinc-400">
                {options.description}
              </div>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!options.notice && (
            <button
              type="button"
              onClick={() => onClose(false)}
              disabled={running}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={running}
            autoFocus
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-70 ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-brand-600 hover:bg-brand-500"
            }`}
          >
            {running && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {options.confirmLabel ?? (options.notice ? "Ok" : danger ? "Apagar" : "Confirmar")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
