"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Search, X } from "lucide-react";
import { GameCover } from "@/components/game-cover";
import { searchGamesForPost, type GameOption } from "@/app/(app)/feed/_actions/photo-post";
import { LIST_LIMITS } from "@/lib/list-input";
import { saveList } from "../_actions/lists";
import { DeleteListButton } from "./delete-list-button";

export type EditorItem = { slug: string; title: string; coverUrl: string | null; steamAppId: number | null; note: string };

type Props = {
  list?: { id: string; title: string; description: string; ranked: boolean; items: EditorItem[] };
  /** Lista nova que já começa com estes jogos (ex.: vindo da página de um jogo) */
  initialItems?: EditorItem[];
};

/** Criar ou editar uma lista: nome, descrição, numerada ou não, jogos (com busca) e um comentário por jogo. */
export function ListEditor({ list, initialItems }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(list?.title ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [ranked, setRanked] = useState(list?.ranked ?? false);
  const [items, setItems] = useState<EditorItem[]>(list?.items ?? initialItems ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = (g: GameOption) =>
    setItems((xs) => (xs.some((x) => x.slug === g.slug) ? xs : [...xs, { slug: g.slug, title: g.title, coverUrl: g.coverUrl, steamAppId: g.steamAppId, note: "" }]));
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setItems((xs) => xs.filter((_, k) => k !== i));
  const setNote = (i: number, note: string) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, note } : x)));

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveList({ id: list?.id, title, description, ranked, items: items.map(({ slug, note }) => ({ slug, note })) });
      if (res.ok) router.push(`/listas/${res.id}`);
      else setError(res.message);
    });
  }


  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-200">Nome</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIST_LIMITS.title}
            placeholder="Ex.: Metroidvanias para zerar num fim de semana"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-200">Descrição (opcional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={LIST_LIMITS.description}
            rows={3}
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-3 text-sm text-zinc-200">
          <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} className="size-4 accent-brand-500" />
          Lista numerada (ranking: a ordem importa)
        </label>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="mb-3 font-semibold text-zinc-100">
          Jogos <span className="text-sm font-normal text-zinc-500">({items.length}/{LIST_LIMITS.items})</span>
        </h2>
        <GameSearch onPick={add} disabled={items.length >= LIST_LIMITS.items} taken={new Set(items.map((i) => i.slug))} />

        {items.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">Busque e adicione o primeiro jogo.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {items.map((it, i) => (
              <li key={it.slug} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                {ranked && <span className="w-6 pt-1 text-right text-sm font-bold tabular-nums text-zinc-500">{i + 1}</span>}
                <span className="w-11 shrink-0">
                  <GameCover title={it.title} coverUrl={it.coverUrl} steamAppId={it.steamAppId} />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate text-sm font-medium text-zinc-100">{it.title}</p>
                  <input
                    value={it.note}
                    onChange={(e) => setNote(i, e.target.value)}
                    maxLength={LIST_LIMITS.note}
                    placeholder="Comentário (opcional)"
                    aria-label={`Comentário sobre ${it.title}`}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <IconBtn label={`Subir ${it.title}`} onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="size-4" aria-hidden />
                  </IconBtn>
                  <IconBtn label={`Descer ${it.title}`} onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                    <ArrowDown className="size-4" aria-hidden />
                  </IconBtn>
                  <IconBtn label={`Tirar ${it.title} da lista`} onClick={() => remove(i)} danger>
                    <X className="size-4" aria-hidden />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {list ? "Salvar alterações" : "Criar lista"}
        </button>
        {list && <DeleteListButton listId={list.id} title={list.title} disabled={pending} />}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-md border border-zinc-800 text-zinc-400 transition disabled:opacity-30 ${
        danger ? "hover:border-red-900 hover:text-red-300" : "hover:border-zinc-600 hover:text-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

/** Busca de jogos (a mesma da página Jogos) com resultados num menu. */
function GameSearch({ onPick, disabled, taken }: { onPick: (g: GameOption) => void; disabled: boolean; taken: Set<string> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GameOption[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchGamesForPost(term).catch(() => []);
      if (id === seq.current) {
        setResults(r);
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const visible = q.trim().length >= 2 ? results : [];
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 focus-within:border-brand-500">
        {loading ? <Loader2 className="size-4 animate-spin text-zinc-500" aria-hidden /> : <Search className="size-4 text-zinc-500" aria-hidden />}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "A lista está cheia" : "Buscar jogo para adicionar…"}
          aria-label="Buscar jogo para adicionar"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
      {visible.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {visible.map((g) => (
            <li key={g.slug}>
              <button
                type="button"
                onClick={() => {
                  onPick(g);
                  setQ("");
                  setResults([]);
                }}
                disabled={taken.has(g.slug)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                <span className="w-8 shrink-0">
                  <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} />
                </span>
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                {g.year && <span className="text-xs text-zinc-500">{g.year}</span>}
                {taken.has(g.slug) ? <span className="text-xs text-zinc-500">na lista</span> : <Plus className="size-4 text-brand-400" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
