import Link from "next/link";
import { Flag, Gamepad2, MessageCircle, PenLine, Trophy, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { FeedItem } from "@/lib/activity";
import { relativeTime } from "@/lib/format";
import { Avatar } from "./avatar";
import { GameCover } from "./game-cover";
import { RatingStars } from "./rating-stars";
import { DeleteActivityButton, LikeButton } from "./activity-actions";

const TYPE = {
  STARTED_GAME: { verb: "começou a jogar", icon: Zap, tone: "text-sky-300 bg-sky-500/10 ring-sky-500/30" },
  COMPLETED: { verb: "finalizou", icon: Flag, tone: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30" },
  PLATINUM: { verb: "platinou", icon: Trophy, tone: "text-amber-300 bg-amber-500/10 ring-amber-500/40" },
  DROPPED: { verb: "dropou", icon: Gamepad2, tone: "text-zinc-300 bg-zinc-500/10 ring-zinc-500/30" },
  REVIEW: { verb: "avaliou", icon: PenLine, tone: "text-violet-300 bg-violet-500/10 ring-violet-500/30" },
} as const;

type Props = { item: FeedItem; viewerId: string | null };

/** Uma publicação do feed / perfil / página do jogo. */
export function ActivityCard({ item, viewerId }: Props) {
  const t = TYPE[item.type];
  const Icon = t.icon;
  const name = item.user.displayName ?? item.user.username;
  const isPlatinum = item.type === "PLATINUM";

  return (
    <article
      className={`rounded-2xl border bg-zinc-900/60 p-4 sm:p-5 ${
        isPlatinum ? "border-amber-500/40 shadow-lg shadow-amber-500/5" : "border-zinc-800"
      }`}
    >
      <header className="flex items-start gap-3">
        <Link href={`/u/${item.user.username}`} className="shrink-0">
          <Avatar name={name} src={item.user.avatarUrl} size="sm" />
        </Link>
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <p className="text-zinc-300">
            <UserLink username={item.user.username}>{name}</UserLink> {t.verb}{" "}
            <Link href={`/games/${item.game.slug}`} className="font-semibold text-zinc-50 hover:underline">
              {item.game.title}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            <Link href={`/p/${item.id}`} className="hover:underline">
              {relativeTime(item.createdAt)}
            </Link>
            {item.source === "STEAM" && " · via Steam"}
          </p>
        </div>
        {viewerId === item.user.id && <DeleteActivityButton activityId={item.id} />}
      </header>

      <div className="mt-4 flex gap-4">
        <Link href={`/games/${item.game.slug}`} className="w-20 shrink-0 sm:w-24">
          <GameCover title={item.game.title} coverUrl={item.game.coverUrl} steamAppId={item.game.steamAppId} />
        </Link>
        <div className="min-w-0 flex-1 space-y-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${t.tone}`}>
            <Icon className="size-3.5" aria-hidden />
            {isPlatinum ? "Platina conquistada" : t.verb.charAt(0).toUpperCase() + t.verb.slice(1)}
          </span>
          {item.rating && (
            <div>
              <RatingStars value={item.rating} />
            </div>
          )}
          {item.review && <Review text={item.review} spoiler={item.containsSpoiler} />}
        </div>
      </div>

      <footer className="mt-3 flex items-center gap-1 border-t border-zinc-800/80 pt-2">
        <LikeButton activityId={item.id} liked={item.likedByMe} count={item.likeCount} canLike={Boolean(viewerId)} />
        <Link
          href={`/p/${item.id}#comentarios`}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <MessageCircle className="size-4" aria-hidden />
          {item.commentCount > 0 ? item.commentCount : "Comentar"}
        </Link>
      </footer>
    </article>
  );
}

function UserLink({ username, children }: { username: string; children: ReactNode }) {
  return (
    <Link href={`/u/${username}`} className="font-semibold text-zinc-50 hover:underline">
      {children}
    </Link>
  );
}

function Review({ text, spoiler }: { text: string; spoiler: boolean }) {
  if (!spoiler) return <p className="whitespace-pre-line text-sm text-zinc-300">{text}</p>;
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none text-amber-300/90 group-open:mb-1">Contém spoiler — clique para ver</summary>
      <p className="whitespace-pre-line text-zinc-300">{text}</p>
    </details>
  );
}
