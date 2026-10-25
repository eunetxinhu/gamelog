import Link from "next/link";
import { Heart, ListOrdered, MessageCircle } from "lucide-react";
import type { ListCardData } from "@/lib/lists";
import { Avatar } from "./avatar";
import { GameCover } from "./game-cover";
import { UserTitle } from "./user-title";

/** Card de lista: capas sobrepostas (como no Letterboxd), nome, autor e números. */
export function ListCard({ list, showAuthor = true }: { list: ListCardData; showAuthor?: boolean }) {
  return (
    <article className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 transition hover:border-zinc-600">
      <div className="flex">
        {Array.from({ length: 5 }, (_, i) => {
          const g = list.covers[i];
          return (
            <div key={i} className="w-1/5 shrink-0 first:ml-0" style={{ marginLeft: i ? "-4%" : 0, zIndex: 5 - i }}>
              {g ? (
                <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} className="shadow-lg shadow-black/50" />
              ) : (
                <div className="aspect-[3/4] rounded-lg bg-zinc-800/60 ring-1 ring-white/5" />
              )}
            </div>
          );
        })}
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold text-zinc-100">
        {/* O link cobre o card todo; o do autor fica por cima (z-10) */}
        <Link href={`/listas/${list.id}`} className="after:absolute after:inset-0 after:rounded-2xl group-hover:text-white">
          {list.title}
        </Link>
      </h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        {showAuthor && (
          <Link href={`/u/${list.author.username}`} className="relative z-10 flex min-w-0 items-center gap-1.5 hover:text-zinc-300">
            <Avatar name={list.author.name} src={list.author.avatar} size="xs" />
            <span className="truncate">{list.author.name}</span>
            <UserTitle title={list.author.title} compact />
          </Link>
        )}
        <span className="flex items-center gap-1">
          <ListOrdered className="size-3.5" aria-hidden /> {list.itemCount} {list.itemCount === 1 ? "jogo" : "jogos"}
        </span>
        {list.likeCount > 0 && (
          <span className="flex items-center gap-1">
            <Heart className="size-3.5" aria-hidden /> {list.likeCount}
          </span>
        )}
        {list.commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3.5" aria-hidden /> {list.commentCount}
          </span>
        )}
      </div>
    </article>
  );
}

export function ListGrid({ lists, showAuthor = true }: { lists: ListCardData[]; showAuthor?: boolean }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lists.map((l) => (
        <li key={l.id}>
          <ListCard list={l} showAuthor={showAuthor} />
        </li>
      ))}
    </ul>
  );
}
