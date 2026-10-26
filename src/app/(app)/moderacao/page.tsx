import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Crown, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { ModerationActions, UnbanButton } from "./_components/moderation-actions";
import { awardLook, titleOf } from "@/lib/awards";
import { AwardPill, UserTitle } from "@/components/user-title";

export const metadata: Metadata = { title: "Moderação" };

const TARGET_LABEL = {
  ACTIVITY: "Publicação",
  COMMENT: "Comentário",
  USER: "Perfil",
  CLUB_POST: "Post de clube",
  MESSAGE: "Mensagem",
  LIST: "Lista",
  LIST_COMMENT: "Comentário em lista",
} as const;

type Target = keyof typeof TARGET_LABEL;

/** Prévia do conteúdo denunciado (o texto e o autor), para decidir sem sair da página. */
async function preview(type: Target, id: string): Promise<{ author: string | null; text: string; href: string | null }> {
  if (type === "ACTIVITY") {
    const a = await prisma.activity.findUnique({ where: { id }, select: { review: true, imageUrl: true, user: { select: { username: true } }, game: { select: { title: true } } } });
    return a ? { author: a.user.username, text: [a.game.title, a.review, a.imageUrl ? "[foto]" : null].filter(Boolean).join(" · "), href: `/p/${id}` } : gone();
  }
  if (type === "COMMENT") {
    const c = await prisma.comment.findUnique({ where: { id }, select: { body: true, activityId: true, user: { select: { username: true } } } });
    return c ? { author: c.user.username, text: c.body, href: `/p/${c.activityId}#comentarios` } : gone();
  }
  if (type === "CLUB_POST") {
    const p = await prisma.clubPost.findUnique({ where: { id }, select: { body: true, imageUrl: true, user: { select: { username: true } }, club: { select: { slug: true } } } });
    return p ? { author: p.user.username, text: [p.body, p.imageUrl ? "[foto]" : null].filter(Boolean).join(" · "), href: `/clubes/${p.club.slug}` } : gone();
  }
  if (type === "MESSAGE") {
    const m = await prisma.message.findUnique({ where: { id }, select: { body: true, imageUrl: true, sender: { select: { username: true } } } });
    return m ? { author: m.sender.username, text: [m.body, m.imageUrl ? "[foto]" : null].filter(Boolean).join(" · "), href: null } : gone();
  }
  if (type === "LIST") {
    const l = await prisma.gameList.findUnique({ where: { id }, select: { title: true, description: true, user: { select: { username: true } } } });
    return l ? { author: l.user.username, text: [l.title, l.description].filter(Boolean).join(" · "), href: `/listas/${id}` } : gone();
  }
  if (type === "LIST_COMMENT") {
    const c = await prisma.gameListComment.findUnique({ where: { id }, select: { body: true, listId: true, user: { select: { username: true } } } });
    return c ? { author: c.user.username, text: c.body, href: `/listas/${c.listId}#comentarios` } : gone();
  }
  const u = await prisma.user.findUnique({ where: { id }, select: { username: true, bio: true, displayName: true } });
  return u ? { author: u.username, text: [u.displayName, u.bio].filter(Boolean).join(" · ") || "(sem bio)", href: `/u/${u.username}` } : gone();
}

function gone() {
  return { author: null, text: "(conteúdo já foi apagado)", href: null };
}

export default async function ModerationPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();

  const [reports, banned, awarded, openErrors] = await Promise.all([
    prisma.report.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: { reporter: { select: { username: true } } },
    }),
    prisma.user.findMany({ where: { bannedAt: { not: null } }, orderBy: { bannedAt: "desc" }, take: 30, select: { id: true, username: true, bannedAt: true } }),
    // Quem tem título ou selo exclusivo (para revisar os prêmios num lugar só)
    prisma.user.findMany({
      where: { OR: [{ title: { not: null } }, { awards: { some: {} } }] },
      orderBy: { username: "asc" },
      take: 100,
      select: { id: true, username: true, title: true, titleIcon: true, titleStyle: true, awards: { select: { id: true, name: true, icon: true, style: true } } },
    }),
    prisma.errorEvent.count({ where: { resolvedAt: null } }),
  ]);
  const previews = await Promise.all(reports.map((r) => preview(r.targetType, r.targetId)));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-50">
        <ShieldAlert className="size-6 text-amber-400" aria-hidden /> Moderação
      </h1>
      <p className="mb-4 text-sm text-zinc-400">Denúncias abertas, mais antigas primeiro.</p>
      <Link
        href="/moderacao/erros"
        className={`mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition ${
          openErrors ? "border-amber-600/50 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15" : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
        }`}
      >
        <AlertTriangle className="size-4 text-amber-400" aria-hidden />
        {openErrors ? `${openErrors} ${openErrors === 1 ? "erro aberto" : "erros abertos"} no site` : "Erros do site: nenhum aberto"}
        <span className="ml-auto text-xs text-zinc-500">ver →</span>
      </Link>

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Nenhuma denúncia aberta. 🎉</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r, i) => {
            const p = previews[i];
            return (
              <li key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="mb-1 text-xs text-zinc-500">
                  <span className="font-semibold text-amber-300">{TARGET_LABEL[r.targetType]}</span> · {r.reason} · por @{r.reporter.username} · {relativeTime(r.createdAt)}
                </p>
                {r.details && <p className="mb-2 text-sm text-zinc-400">“{r.details}”</p>}
                <div className="mb-3 rounded-lg bg-zinc-950/60 p-3 text-sm text-zinc-200">
                  {p.author && <span className="text-zinc-500">@{p.author}: </span>}
                  <span className="whitespace-pre-line break-words">{p.text}</span>
                  {p.href && (
                    <Link href={p.href} className="ml-2 text-brand-400 hover:underline">
                      ver
                    </Link>
                  )}
                </div>
                <ModerationActions reportId={r.id} canBan={Boolean(p.author)} />
              </li>
            );
          })}
        </ul>
      )}

      {banned.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Contas suspensas</h2>
          <ul className="space-y-2">
            {banned.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm">
                <span className="text-zinc-200">
                  @{b.username} <span className="text-zinc-500">· suspensa {relativeTime(b.bannedAt!)}</span>
                </span>
                <UnbanButton userId={b.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-zinc-50">
          <Crown className="size-5 text-amber-300" aria-hidden /> Premiados
        </h2>
        <p className="mb-3 text-sm text-zinc-500">Para dar ou tirar um título ou selo, abra o perfil e use o botão Premiar.</p>
        {awarded.length === 0 ? (
          <p className="text-sm text-zinc-500">Ninguém premiado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {awarded.map((u) => (
              <li key={u.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <Link href={`/u/${u.username}`} className="text-sm font-medium text-zinc-100 hover:underline">
                  @{u.username}
                </Link>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <UserTitle title={titleOf(u)} />
                  {u.awards.map((b) => {
                    const look = awardLook(b.icon, b.style);
                    return <AwardPill key={b.id} text={b.name} icon={look.icon} style={look.style} size="xs" />;
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
