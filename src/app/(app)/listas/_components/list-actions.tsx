"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Loader2, Send, Trash2 } from "lucide-react";
import { addListComment, deleteListComment, toggleListLike } from "../_actions/lists";
import { useConfirm } from "@/components/confirm-dialog";

export function ListLikeButton({ listId, initialLiked, initialCount, loggedIn }: { listId: string; initialLiked: boolean; initialCount: number; loggedIn: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!loggedIn) return router.push(`/login?next=/listas/${listId}`);
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    startTransition(async () => {
      const res = await toggleListLike(listId);
      if (!res.ok || res.liked !== next) {
        setLiked(!next);
        setCount((c) => c + (next ? -1 : 1));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={liked}
      data-pending={pending || undefined}
      className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
        liked ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      <Heart className={`size-4 ${liked ? "fill-rose-400 text-rose-400" : ""}`} aria-hidden />
      {liked ? "Curtida" : "Curtir"}
      <span className="tabular-nums text-zinc-400">{count}</span>
    </button>
  );
}

export function ListCommentForm({ listId }: { listId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addListComment(listId, body);
      if (res.ok) {
        setBody("");
        router.refresh();
      } else setError(res.message ?? "Não deu para comentar.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Comente sobre a lista…"
          aria-label="Comentário"
          className="min-w-0 flex-1 resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !body.trim()}
          aria-label="Enviar comentário"
          className="grid size-10 place-items-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}

export function DeleteListCommentButton({ id }: { id: string }) {
  const router = useRouter();
  const ask = useConfirm();
  return (
    <button
      type="button"
      onClick={async () => {
        if (await ask({ title: "Apagar este comentário?", action: () => deleteListComment(id) })) router.refresh();
      }}
      aria-label="Apagar comentário"
      className="rounded p-1 text-zinc-500 transition hover:text-red-300 disabled:opacity-50"
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}
