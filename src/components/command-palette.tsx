"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, ListOrdered, Loader2, Search, UserRound, Users, X } from "lucide-react";
import { globalSearch, type SearchHit } from "@/app/(app)/_actions/search";
import { Avatar } from "./avatar";
import { GameCover } from "./game-cover";

const GROUPS: { kind: SearchHit["kind"]; label: string; icon: typeof Search }[] = [
  { kind: "game", label: "Jogos", icon: Gamepad2 },
  { kind: "person", label: "Pessoas", icon: UserRound },
  { kind: "list", label: "Listas", icon: ListOrdered },
  { kind: "club", label: "Clubes", icon: Users },
];

/**
 * Busca única do topo: jogos, pessoas, listas e clubes. Abre com Ctrl+K / ⌘K ou "/"
 * (fora de campos de texto), navega com ↑ ↓ e Enter, fecha com Esc.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Computador: campo "falso" com o atalho; celular: só a lupa */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar jogos, pessoas, listas e clubes (Ctrl+K)"
        className="hidden h-9 w-48 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300 2xl:flex"
      >
        <Search className="size-4" aria-hidden />
        Buscar…
        <kbd className="ml-auto rounded border border-zinc-700 px-1.5 font-sans text-[10px] text-zinc-400">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 2xl:hidden"
      >
        <Search className="size-5 md:size-4" aria-hidden />
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await globalSearch(term).catch(() => []);
      if (id === seq.current) {
        setHits(r);
        setActive(0);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Ordem de exibição = ordem da navegação pelo teclado
  const shown = useMemo(() => (q.trim().length >= 2 ? GROUPS.flatMap((g) => hits.filter((h) => h.kind === g.kind)) : []), [hits, q]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = shown.length ? (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length : 0;
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) go(shown[active].href);
      else if (q.trim()) go(`/games?q=${encodeURIComponent(q.trim())}`);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Buscar" className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-3 pt-[10vh] backdrop-blur-sm sm:p-4 sm:pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
          {loading ? <Loader2 className="size-5 animate-spin text-zinc-500" aria-hidden /> : <Search className="size-5 text-zinc-500" aria-hidden />}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar jogos, pessoas, listas e clubes…"
            aria-label="Buscar"
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls="busca-resultados"
            aria-activedescendant={shown[active] ? `busca-${active}` : undefined}
            className="min-w-0 flex-1 bg-transparent py-4 text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1 text-zinc-500 hover:text-zinc-200">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <ul id="busca-resultados" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 && <li className="px-3 py-6 text-center text-sm text-zinc-500">Digite pelo menos 2 letras. Dica: abra com Ctrl+K ou /</li>}
          {q.trim().length >= 2 && !loading && shown.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-zinc-500">Nada encontrado para “{q.trim()}”.</li>
          )}
          {GROUPS.map((g) => {
            const items = shown.filter((h) => h.kind === g.kind);
            if (items.length === 0) return null;
            return (
              <li key={g.kind} role="presentation">
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <g.icon className="size-3.5" aria-hidden /> {g.label}
                </p>
                <ul role="group">
                  {items.map((h) => {
                    const i = shown.indexOf(h);
                    return (
                      <li key={h.href} id={`busca-${i}`} role="option" aria-selected={i === active} data-index={i}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(h.href)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-brand-500/15" : ""}`}
                        >
                          <HitIcon hit={h} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-zinc-100">{h.title}</span>
                            {h.sub && <span className="block truncate text-xs text-zinc-500">{h.sub}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
          {shown.some((h) => h.kind === "game") && (
            <li role="presentation">
              <button type="button" onClick={() => go(`/games?q=${encodeURIComponent(q.trim())}`)} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-brand-400 hover:bg-zinc-900">
                Ver todos os jogos para “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function HitIcon({ hit }: { hit: SearchHit }) {
  if (hit.kind === "game")
    return (
      <span className="w-7 shrink-0">
        <GameCover title={hit.title} coverUrl={hit.coverUrl} steamAppId={hit.steamAppId} />
      </span>
    );
  if (hit.kind === "person") return <Avatar name={hit.title} src={hit.avatar} size="xs" />;
  if (hit.kind === "club" && hit.imageUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={hit.imageUrl} alt="" className="size-7 shrink-0 rounded-md object-cover" />;
  const Icon = hit.kind === "list" ? ListOrdered : Users;
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-800 text-zinc-400">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
