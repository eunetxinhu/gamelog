import type { Metadata } from "next";
import Link from "next/link";
import { Flame, ListPlus, Sparkles, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canSeeProfile } from "@/lib/privacy";
import { getListCards, getPopularLists } from "@/lib/lists";
import { ListGrid } from "@/components/list-card";

export const metadata: Metadata = { title: "Listas", description: "Listas de jogos feitas pela comunidade." };

type Props = { searchParams: Promise<{ de?: string }> };

export default async function ListsPage({ searchParams }: Props) {
  const { de } = await searchParams;
  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;

  // Listas de uma pessoa (link do perfil)
  if (de) {
    const author = await prisma.user.findUnique({ where: { username: de }, select: { id: true, username: true, displayName: true, isPrivate: true, bannedAt: true } });
    const allowed = author && (await canSeeProfile(viewerId, author));
    const lists = allowed ? await getListCards({ viewerId, where: { userId: author.id }, take: 100 }) : [];
    const name = author?.displayName ?? author?.username ?? de;
    return (
      <Shell canCreate={viewerId === author?.id}>
        <h1 className="mb-1 text-2xl font-bold text-zinc-50">Listas de {name}</h1>
        <p className="mb-6 text-sm text-zinc-400">
          <Link href={`/u/${de}`} className="text-sky-400 hover:underline">
            Voltar ao perfil
          </Link>
        </p>
        {lists.length ? <ListGrid lists={lists} showAuthor={false} /> : <Empty text={allowed ? "Nenhuma lista ainda." : "Estas listas não estão disponíveis."} />}
      </Shell>
    );
  }

  const [popular, recent, mine] = await Promise.all([
    getPopularLists(viewerId, 6),
    getListCards({ viewerId, orderBy: [{ createdAt: "desc" }], take: 12 }),
    viewerId ? getListCards({ viewerId, where: { userId: viewerId }, take: 6 }) : [],
  ]);

  return (
    <Shell canCreate={Boolean(viewer && !viewer.bannedAt)}>
      <h1 className="mb-1 text-2xl font-bold text-zinc-50">Listas</h1>
      <p className="mb-6 text-sm text-zinc-400">Coleções e rankings da comunidade: “Metroidvanias curtos”, “Para jogar em dupla”, “Melhores trilhas”…</p>

      <div className="space-y-10">
        {mine.length > 0 && (
          <Section icon={<UserRound className="size-4 text-sky-400" aria-hidden />} title="Suas listas" more={viewer ? `/listas?de=${viewer.username}` : undefined}>
            <ListGrid lists={mine} showAuthor={false} />
          </Section>
        )}
        {popular.length > 0 && (
          <Section icon={<Flame className="size-4 text-orange-400" aria-hidden />} title="Populares no mês">
            <ListGrid lists={popular} />
          </Section>
        )}
        <Section icon={<Sparkles className="size-4 text-violet-400" aria-hidden />} title="Recentes">
          {recent.length ? <ListGrid lists={recent} /> : <Empty text="Ninguém criou uma lista ainda. Que tal ser a primeira pessoa?" />}
        </Section>
      </div>
    </Shell>
  );
}

function Shell({ canCreate, children }: { canCreate: boolean; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      {canCreate && (
        <Link
          href="/listas/nova"
          className="float-right ml-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
        >
          <ListPlus className="size-4" aria-hidden /> Nova lista
        </Link>
      )}
      {children}
    </main>
  );
}

function Section({ icon, title, more, children }: { icon: React.ReactNode; title: string; more?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-50">
        {icon}
        {title}
        {more && (
          <Link href={more} className="ml-auto text-sm font-normal text-sky-400 hover:underline">
            Ver todas
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">{text}</p>;
}
