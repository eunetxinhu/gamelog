"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Share2, Star, Trash2 } from "lucide-react";
import type { LogStatus } from "@/generated/prisma/enums";
import { STATUS_LABEL } from "@/lib/format";
import { removeGameLog, saveGameLog } from "../_actions/log";
import { ImageAttach } from "@/components/image-attach";

type Props = {
  gameId: string;
  loggedIn: boolean;
  slug: string;
  initial: { status: LogStatus; rating: number | null; review: string | null; containsSpoiler: boolean } | null;
};

const STATUS_ORDER: LogStatus[] = ["PLAYING", "COMPLETED", "PLATINUM", "DROPPED", "BACKLOG"];
const STATUS_TONE: Record<LogStatus, string> = {
  PLAYING: "peer-checked:bg-sky-600 peer-checked:text-white peer-checked:ring-sky-500",
  COMPLETED: "peer-checked:bg-emerald-600 peer-checked:text-white peer-checked:ring-emerald-500",
  PLATINUM: "peer-checked:bg-amber-500 peer-checked:text-zinc-950 peer-checked:ring-amber-400",
  DROPPED: "peer-checked:bg-zinc-600 peer-checked:text-white peer-checked:ring-zinc-500",
  BACKLOG: "peer-checked:bg-violet-600 peer-checked:text-white peer-checked:ring-violet-500",
};

/** Registrar / compartilhar o jogo: status, nota e review. */
export function LogForm({ gameId, loggedIn, slug, initial }: Props) {
  const [status, setStatus] = useState<LogStatus>(initial?.status ?? "PLAYING");
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [hover, setHover] = useState<number | null>(null);
  const [review, setReview] = useState(initial?.review ?? "");
  const [spoiler, setSpoiler] = useState(initial?.containsSpoiler ?? false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [hasLog, setHasLog] = useState(Boolean(initial));

  if (!loggedIn) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-300">
        <Link href={`/login?next=/games/${slug}`} className="font-medium text-sky-400 hover:underline">
          Entre
        </Link>{" "}
        para registrar este jogo e compartilhar no feed.
      </div>
    );
  }

  function onSave() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveGameLog({ gameId, status, rating, review, containsSpoiler: spoiler, imageUrl });
      if (!res.ok) return setMessage({ tone: "error", text: res.message });
      setHasLog(true);
      setImageUrl(null);
      setMessage({ tone: "ok", text: res.posted ? "Salvo e compartilhado no feed!" : "Salvo no seu perfil." });
    });
  }

  function onRemove() {
    if (!confirm("Tirar este jogo do seu perfil?")) return;
    startTransition(async () => {
      await removeGameLog(gameId);
      setHasLog(false);
      setRating(null);
      setReview("");
      setMessage({ tone: "ok", text: "Removido do seu perfil." });
    });
  }

  const shown = hover ?? rating ?? 0;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
      <h2 className="font-semibold text-zinc-50">{hasLog ? "Seu registro" : "Registrar e compartilhar"}</h2>

      <fieldset>
        <legend className="mb-2 text-sm text-zinc-400">Status</legend>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <label key={s} className="cursor-pointer">
              <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="peer sr-only" />
              <span
                className={`inline-block rounded-full px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-zinc-700 transition peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 ${STATUS_TONE[s]}`}
              >
                {s === "PLATINUM" ? "🏆 " : ""}
                {STATUS_LABEL[s]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-1 text-sm text-zinc-400">Nota</p>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(rating === n ? null : n)}
              aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              className="rounded p-1 sm:p-0.5"
            >
              <Star className={`size-8 transition sm:size-7 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-zinc-600"}`} aria-hidden />
            </button>
          ))}
          {rating && (
            <button type="button" onClick={() => setRating(null)} className="ml-2 text-xs text-zinc-500 hover:text-zinc-300">
              limpar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="review" className="text-sm text-zinc-400">
          Review (opcional)
        </label>
        <textarea
          id="review"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="O que achou? Use @usuario para mencionar alguém"
          className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        />
        {review.trim() && (
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} className="accent-amber-500" />
            Contém spoiler
          </label>
        )}
      </div>

      <ImageAttach kind="post" value={imageUrl} onChange={setImageUrl} />

      {message && (
        <p role="status" className={`flex items-center gap-1.5 text-sm ${message.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>
          {message.tone === "ok" && <CheckCircle2 className="size-4" aria-hidden />}
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50 sm:flex-none sm:py-2"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
          {status === "BACKLOG" ? "Salvar no backlog" : "Salvar e compartilhar"}
        </button>
        {hasLog && (
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-red-300"
          >
            <Trash2 className="size-4" aria-hidden />
            Remover
          </button>
        )}
      </div>
    </section>
  );
}
