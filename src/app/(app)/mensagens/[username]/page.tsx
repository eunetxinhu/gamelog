import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canMessage, conversationPair } from "@/lib/dm";
import { Avatar } from "@/components/avatar";
import { Thread } from "../_components/thread";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Mensagens com @${decodeURIComponent((await params).username)} · GameLog` };
}

/** Conversa com uma pessoa. */
export default async function ConversationPage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/mensagens/${username}`);

  const other = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true, dmPolicy: true, bannedAt: true },
  });
  if (!other) notFound();
  if (other.id === viewer.id) redirect("/mensagens");

  const [conversation, allowed] = await Promise.all([
    prisma.conversation.findUnique({
      where: { userAId_userBId: conversationPair(viewer.id, other.id) },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 100, select: { id: true, body: true, imageUrl: true, senderId: true, createdAt: true } } },
    }),
    canMessage(viewer.id, other),
  ]);
  const name = other.displayName ?? other.username;
  const messages = (conversation?.messages ?? []).reverse().map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));

  return (
    // Ocupa a tela toda abaixo do cabeçalho (a barra inferior some nesta página)
    <main className="mx-auto flex h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top))] max-w-2xl flex-col px-4 pt-3">
      <header className="mb-2 flex items-center gap-3 border-b border-zinc-800 pb-3">
        <Link href="/mensagens" className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800" aria-label="Voltar para as conversas">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <Link href={`/u/${other.username}`} className="flex min-w-0 items-center gap-3">
          <Avatar name={name} src={other.avatarUrl ?? other.steamAvatarUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-zinc-50">{name}</span>
            <span className="block truncate text-xs text-zinc-500">@{other.username}</span>
          </span>
        </Link>
      </header>

      <Thread
        username={other.username}
        viewerId={viewer.id}
        conversationId={conversation?.id ?? null}
        messages={messages}
        blockedReason={allowed.ok ? null : allowed.reason}
      />
    </main>
  );
}
