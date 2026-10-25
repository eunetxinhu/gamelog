import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { blockedIds } from "@/lib/privacy";
import { relativeTime } from "@/lib/format";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "Mensagens · GameLog" };

const userSelect = { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } as const;

/** Lista de conversas, mais recentes primeiro. */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/mensagens");

  // "Nova mensagem": vai direto para a conversa
  const para = (await searchParams).para?.trim().replace(/^@/, "").toLowerCase();
  if (para) redirect(`/mensagens/${encodeURIComponent(para)}`);

  const hidden = await blockedIds(viewer.id);
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: viewer.id }, { userBId: viewer.id }] },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: {
      userA: { select: userSelect },
      userB: { select: userSelect },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, imageUrl: true, senderId: true, createdAt: true } },
    },
  });

  const items = conversations
    .map((c) => {
      const mine = c.userAId === viewer.id;
      const other = mine ? c.userB : c.userA;
      const readAt = mine ? c.readAtA : c.readAtB;
      const last = c.messages[0];
      return { id: c.id, other, last, unread: Boolean(last && last.senderId !== viewer.id && (!readAt || last.createdAt > readAt)) };
    })
    .filter((c) => c.last && !hidden.includes(c.other.id));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold text-zinc-50">
        <Mail className="size-6 text-sky-400" aria-hidden /> Mensagens
      </h1>

      <form action="/mensagens" className="mb-6 flex gap-2">
        <label htmlFor="para" className="sr-only">
          Nova mensagem para
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 focus-within:border-sky-500">
          <Search className="size-4 text-zinc-500" aria-hidden />
          <input id="para" name="para" placeholder="Nova mensagem para @usuario" autoComplete="off" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
        </div>
        <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
          Abrir
        </button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Nenhuma conversa ainda. Abra o perfil de alguém e toque em “Mensagem”.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          {items.map(({ id, other, last, unread }) => {
            const name = other.displayName ?? other.username;
            return (
              <li key={id}>
                <Link href={`/mensagens/${other.username}`} className={`flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-800/60 ${unread ? "bg-sky-500/[0.06]" : ""}`}>
                  <Avatar name={name} src={other.avatarUrl ?? other.steamAvatarUrl} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${unread ? "font-bold text-zinc-50" : "font-medium text-zinc-100"}`}>{name}</span>
                    <span className={`block truncate text-sm ${unread ? "text-zinc-200" : "text-zinc-500"}`}>
                      {last!.senderId === viewer.id && "Você: "}
                      {last!.body || "📷 Foto"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{relativeTime(last!.createdAt)}</span>
                  {unread && <span className="size-2.5 shrink-0 rounded-full bg-sky-400" aria-label="Não lida" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
