import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ListEditor } from "../_components/list-editor";

export const metadata: Metadata = { title: "Nova lista" };

type Props = { searchParams: Promise<{ jogo?: string }> };

/** `?jogo=<slug>` (vindo da página do jogo) já começa com ele na lista. */
export default async function NewListPage({ searchParams }: Props) {
  const { jogo } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/listas/nova${jogo ? `?jogo=${jogo}` : ""}`)}`);
  if (user.bannedAt) redirect("/listas");

  const game = jogo ? await prisma.game.findUnique({ where: { slug: jogo }, select: { slug: true, title: true, coverUrl: true, steamAppId: true } }) : null;
  return (
    <main className="mx-auto max-w-2xl px-4 py-5 sm:py-8">
      <h1 className="mb-5 text-2xl font-bold text-zinc-50">Nova lista</h1>
      <ListEditor key={game?.slug ?? "nova"} initialItems={game ? [{ ...game, note: "" }] : undefined} />
    </main>
  );
}
