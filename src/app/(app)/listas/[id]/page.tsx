import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getListForViewer } from "@/lib/lists";
import { relativeTime } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { GameCover } from "@/components/game-cover";
import { ReportButton } from "@/components/report-button";
import { UserTitle } from "@/components/user-title";
import { WishlistQuickButton } from "@/components/wishlist-quick-button";
import { wishlistSetFor } from "@/lib/wishlist";
import { inWishlist } from "@/lib/wishlist-keys";
import { DeleteListCommentButton, ListCommentForm, ListLikeButton } from "../_components/list-actions";
import { DeleteListButton } from "../_components/delete-list-button";
import { titleOf } from "@/lib/awards";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const list = await getListForViewer(id, (await getCurrentUser())?.id ?? null);
  if (!list) return { title: "Lista" };
  const by = list.user.displayName ?? list.user.username;
  return { title: `${list.title} (lista de ${by})`, openGraph: { title: `${list.title} (lista de ${by})` }, description: list.description?.slice(0, 160) ?? `${list.items.length} jogos escolhidos por @${list.user.username}.` };
}

export default async function ListPage({ params }: Props) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  const list = await getListForViewer(id, viewer?.id ?? null);
  if (!list) notFound();

  const isOwner = viewer?.id === list.user.id;
  const author = list.user.displayName ?? list.user.username;
  const wish = await wishlistSetFor(viewer?.id, list.items.map((i) => i.game));
  const withNotes = list.items.some((i) => i.note);

  return (
    <main className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
      <header className="mb-6 space-y-3">
        <Link href={`/u/${list.user.username}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
          <Avatar name={author} src={list.user.avatarUrl ?? list.user.steamAvatarUrl} size="xs" />
          Lista de <strong className="font-semibold text-zinc-200">{author}</strong>
          <UserTitle title={titleOf(list.user)} compact />
        </Link>
        <h1 className="text-2xl font-bold text-zinc-50 sm:text-3xl">{list.title}</h1>
        {list.description && <p className="max-w-prose whitespace-pre-line text-sm text-zinc-300">{list.description}</p>}
        <p className="text-xs text-zinc-500">
          {list.items.length} {list.items.length === 1 ? "jogo" : "jogos"} · atualizada {relativeTime(list.updatedAt)}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ListLikeButton listId={list.id} initialLiked={list.likedByMe} initialCount={list.likeCount} loggedIn={Boolean(viewer)} />
          <a href="#comentarios" className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800">
            <MessageCircle className="size-4" aria-hidden /> {list.comments.length}
          </a>
          {isOwner && (
            <Link
              href={`/listas/${list.id}/editar`}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
            >
              <Pencil className="size-4" aria-hidden /> Editar
            </Link>
          )}
          {/* Mesmo lugar do "Apagar clube": na página, para a dona e para a moderação */}
          {(isOwner || viewer?.isAdmin) && <DeleteListButton listId={list.id} title={list.title} compact />}
          {viewer && !isOwner && (
            <ReportButton
              targetType="LIST"
              targetId={list.id}
              label="Denunciar"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            />
          )}
        </div>
      </header>

      {/* Com comentários por jogo (ou numerada): uma linha por jogo. Sem: grade de capas. */}
      {list.ranked || withNotes ? (
        <ol className="space-y-3">
          {list.items.map((it, i) => (
            <li key={it.game.id} className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              {list.ranked && <span className="w-8 shrink-0 pt-2 text-right text-xl font-extrabold tabular-nums text-zinc-500">{i + 1}</span>}
              <div className="relative w-20 shrink-0 sm:w-24">
                <Link href={`/games/${it.game.slug}`} className="group block">
                  <GameCover title={it.game.title} coverUrl={it.game.coverUrl} steamAppId={it.game.steamAppId} className="transition group-hover:ring-brand-500" />
                </Link>
                <WishlistQuickButton slug={it.game.slug} title={it.game.title} initial={inWishlist(wish, it.game)} loggedIn={Boolean(viewer)} className="right-1 top-1" />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <Link href={`/games/${it.game.slug}`} className="font-semibold text-zinc-100 hover:underline">
                  {it.game.title}
                </Link>
                {it.game.releaseDate && <span className="ml-2 text-xs text-zinc-500">{it.game.releaseDate.getUTCFullYear()}</span>}
                {it.note && <p className="mt-1.5 whitespace-pre-line text-sm text-zinc-300">{it.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4">
          {list.items.map((it) => (
            <li key={it.game.id} className="relative">
              <Link href={`/games/${it.game.slug}`} className="group block space-y-1.5" title={it.game.title}>
                <GameCover title={it.game.title} coverUrl={it.game.coverUrl} steamAppId={it.game.steamAppId} className="transition group-hover:ring-brand-500" />
                <p className="line-clamp-2 text-xs font-medium text-zinc-300 group-hover:text-white">{it.game.title}</p>
              </Link>
              <WishlistQuickButton slug={it.game.slug} title={it.game.title} initial={inWishlist(wish, it.game)} loggedIn={Boolean(viewer)} className="right-1 top-1" />
            </li>
          ))}
        </ul>
      )}

      <section id="comentarios" className="mt-10 scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold text-zinc-50">Comentários</h2>
        {list.comments.length === 0 && <p className="mb-4 text-sm text-zinc-500">Ninguém comentou ainda.</p>}
        <ul className="mb-4 space-y-3">
          {list.comments.map((c) => {
            const name = c.user.displayName ?? c.user.username;
            const canDelete = viewer && (viewer.id === c.user.id || isOwner || viewer.isAdmin);
            return (
              <li key={c.id} className="flex gap-3">
                <Link href={`/u/${c.user.username}`} className="shrink-0">
                  <Avatar name={name} src={c.user.avatarUrl ?? c.user.steamAvatarUrl} size="sm" />
                </Link>
                <div className="min-w-0 flex-1 rounded-xl bg-zinc-900/80 px-3 py-2">
                  <p className="flex items-center gap-2 text-xs text-zinc-500">
                    <Link href={`/u/${c.user.username}`} className="font-semibold text-zinc-200 hover:underline">
                      {name}
                    </Link>
                    <UserTitle title={titleOf(c.user)} compact />
                    {relativeTime(c.createdAt)}
                    <span className="ml-auto flex items-center">
                      {viewer && viewer.id !== c.user.id && (
                        <ReportButton targetType="LIST_COMMENT" targetId={c.id} className="rounded p-1 text-zinc-500 hover:text-zinc-300" />
                      )}
                      {canDelete && <DeleteListCommentButton id={c.id} />}
                    </span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-zinc-200">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {viewer && !viewer.bannedAt ? (
          <ListCommentForm listId={list.id} />
        ) : !viewer ? (
          <Link href={`/login?next=/listas/${list.id}`} className="text-sm text-brand-400 hover:underline">
            Entre para comentar
          </Link>
        ) : null}
      </section>
    </main>
  );
}
