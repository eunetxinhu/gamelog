import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ListEditor } from "../../_components/list-editor";

export const metadata: Metadata = { title: "Editar lista" };

type Props = { params: Promise<{ id: string }> };

export default async function EditListPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/listas/${id}/editar`);

  const list = await prisma.gameList.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" }, select: { note: true, game: { select: { slug: true, title: true, coverUrl: true, steamAppId: true } } } } },
  });
  if (!list || list.userId !== user.id) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-5 sm:py-8">
      <h1 className="mb-5 text-2xl font-bold text-zinc-50">Editar lista</h1>
      <ListEditor
        list={{
          id: list.id,
          title: list.title,
          description: list.description ?? "",
          ranked: list.ranked,
          items: list.items.map((i) => ({ ...i.game, note: i.note ?? "" })),
        }}
      />
    </main>
  );
}
