"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { thumbOf } from "@/lib/image-urls";
import { useRouter } from "next/navigation";
import { Loader2, Send, Trash2 } from "lucide-react";
import { ImageAttach } from "@/components/image-attach";
import { MentionText } from "@/components/mention-text";
import { deleteMessage, markConversationRead, sendMessage } from "../_actions/dm";

type Msg = { id: string; body: string; imageUrl: string | null; senderId: string; createdAt: string };

/** Enquanto a conversa está aberta e visível, busca mensagens novas nesse intervalo. */
const POLL_MS = 5000;

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });

export function Thread({
  username,
  viewerId,
  conversationId,
  messages,
  blockedReason,
}: {
  username: string;
  viewerId: string;
  conversationId: string | null;
  messages: Msg[];
  blockedReason: string | null;
}) {
  const router = useRouter();
  const bottom = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastId = messages.at(-1)?.id;

  // Rola para o fim e marca como lida quando chega mensagem nova
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    if (conversationId) markConversationRead(conversationId);
  }, [lastId, conversationId]);

  // Busca mensagens novas periodicamente (só com a aba visível)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() && !image) return;
    setError(null);
    startTransition(async () => {
      const res = await sendMessage(username, body, image);
      if (!res.ok) return setError(res.message);
      setBody("");
      setImage(null);
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm("Apagar esta mensagem?")) return;
    startTransition(async () => {
      await deleteMessage(id);
      router.refresh();
    });
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-3" aria-live="polite">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">Nenhuma mensagem ainda. Diga oi! 👋</p>}
        {messages.map((m, i) => {
          const mine = m.senderId === viewerId;
          const date = new Date(m.createdAt);
          const newDay = i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== date.toDateString();
          return (
            <div key={m.id}>
              {newDay && <p className="my-3 text-center text-xs text-zinc-500">{dayFmt.format(date)}</p>}
              <div className={`group flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                {mine && (
                  <button type="button" onClick={() => onDelete(m.id)} className="rounded-full p-1.5 text-zinc-600 transition hover:text-red-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100" aria-label="Apagar mensagem">
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-md bg-sky-600 text-white" : "rounded-bl-md bg-zinc-800 text-zinc-100"}`}>
                  {m.imageUrl && (
                    <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbOf(m.imageUrl)} alt="Foto" loading="lazy" className="mb-1 max-h-64 rounded-lg" />
                    </a>
                  )}
                  {m.body && <MentionText text={m.body} className="block whitespace-pre-line break-words" />}
                  <span className={`mt-0.5 block text-right text-[10px] ${mine ? "text-sky-100/80" : "text-zinc-500"}`}>{timeFmt.format(date)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {blockedReason ? (
        <p className="border-t border-zinc-800 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] text-center text-sm text-zinc-500">{blockedReason}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2 border-t border-zinc-800 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
          {image && <ImageAttach kind="dm" value={image} onChange={setImage} />}
          <div className="flex items-end gap-2">
            {!image && <ImageAttach kind="dm" value={null} onChange={setImage} compact />}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // No celular o Enter quebra a linha; enviar é pelo botão
                if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) onSubmit(e);
              }}
              enterKeyHint="send"
              rows={1}
              maxLength={2000}
              placeholder="Escreva uma mensagem…"
              aria-label="Mensagem"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
            />
            <button type="submit" disabled={pending || (!body.trim() && !image)} className="rounded-xl bg-sky-600 p-2.5 text-white hover:bg-sky-500 disabled:opacity-50" aria-label="Enviar">
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
            </button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </form>
      )}
    </>
  );
}
