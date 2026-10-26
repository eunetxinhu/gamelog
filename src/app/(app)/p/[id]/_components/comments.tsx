"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Send, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { MentionText } from "@/components/mention-text";
import { ReportButton } from "@/components/report-button";
import { relativeTime } from "@/lib/format";
import { addComment, deleteComment } from "@/app/(app)/_actions/social";
import { useConfirm } from "@/components/confirm-dialog";

export type CommentView = {
  id: string;
  body: string;
  createdAt: string; // ISO
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
};

type Props = {
  activityId: string;
  initial: CommentView[];
  viewer: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null;
  /** Dono da publicação também pode apagar comentários */
  activityOwnerId: string;
};

export function Comments({ activityId, initial, viewer, activityOwnerId }: Props) {
  const [comments, setComments] = useState(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ask = useConfirm();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addComment(activityId, body);
      if (!res.ok) return setError(res.message);
      setComments((c) => [...c, res.comment]);
      setBody("");
    });
  }

  async function onDelete(id: string) {
    if (await ask({ title: "Apagar este comentário?", action: () => deleteComment(id) })) {
      setComments((c) => c.filter((x) => x.id !== id));
    }
  }

  return (
    <section id="comentarios" className="mt-6 scroll-mt-20">
      <h2 className="mb-3 text-lg font-semibold text-zinc-50">
        Comentários {comments.length > 0 && <span className="text-zinc-500">({comments.length})</span>}
      </h2>

      {comments.length === 0 && <p className="mb-4 text-sm text-zinc-500">Nenhum comentário ainda.</p>}

      <ul className="mb-5 space-y-4">
        {comments.map((c) => {
          const name = c.user.displayName ?? c.user.username;
          const canDelete = viewer && (viewer.id === c.user.id || viewer.id === activityOwnerId);
          return (
            <li key={c.id} className="flex gap-3">
              <Link href={`/u/${c.user.username}`} className="shrink-0">
                <Avatar name={name} src={c.user.avatarUrl} size="sm" />
              </Link>
              <div className="min-w-0 flex-1 rounded-xl bg-zinc-900/80 px-3 py-2">
                <p className="text-sm">
                  <Link href={`/u/${c.user.username}`} className="font-semibold text-zinc-100 hover:underline">
                    {name}
                  </Link>{" "}
                  <span className="text-xs text-zinc-500">{relativeTime(c.createdAt)}</span>
                </p>
                <MentionText text={c.body} className="block whitespace-pre-line break-words text-sm text-zinc-300" />
              </div>
              {viewer && viewer.id !== c.user.id && <ReportButton targetType="COMMENT" targetId={c.id} />}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="self-start rounded-full p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-300"
                  aria-label="Apagar comentário"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {viewer ? (
        <form onSubmit={onSubmit} className="flex items-start gap-3">
          <Avatar name={viewer.displayName ?? viewer.username} src={viewer.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSubmit(e);
              }}
              rows={2}
              maxLength={1000}
              placeholder="Escreva um comentário… (@usuario para mencionar)"
              aria-label="Comentário"
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              Comentar
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-zinc-400">
          <Link href={`/login?next=/p/${activityId}`} className="text-brand-400 hover:underline">
            Entre
          </Link>{" "}
          para comentar.
        </p>
      )}
    </section>
  );
}
