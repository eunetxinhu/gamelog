import Link from "next/link";
import { Camera, Flag, Gamepad2, Gem, MessageCircle, PenLine, Trophy, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { FeedItem } from "@/lib/activity";
import { relativeTime } from "@/lib/format";
import { Avatar } from "./avatar";
import { GameCover } from "./game-cover";
import { RatingStars } from "./rating-stars";
import { DeleteActivityButton, ReactionButton } from "./activity-actions";
import { ReportButton } from "./report-button";
import { formatRarity, RARE_PERCENT } from "@/lib/rarity";
import { MentionText } from "./mention-text";

const TYPE = {
  STARTED_GAME: { verb: "começou a jogar", icon: Zap, tone: "text-sky-300 bg-sky-500/10 ring-sky-500/30" },
  COMPLETED: { verb: "finalizou", icon: Flag, tone: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30" },
  PLATINUM: { verb: "platinou", icon: Trophy, tone: "text-amber-300 bg-amber-500/10 ring-amber-500/40" },
  DROPPED: { verb: "dropou", icon: Gamepad2, tone: "text-zinc-300 bg-zinc-500/10 ring-zinc-500/30" },
  REVIEW: { verb: "avaliou", icon: PenLine, tone: "text-violet-300 bg-violet-500/10 ring-violet-500/30" },
  RARE_ACHIEVEMENT: { verb: "desbloqueou uma conquista rara em", icon: Gem, tone: "text-fuchsia-300 bg-fuchsia-500/10 ring-fuchsia-500/30" },
  SCREENSHOT: { verb: "compartilhou um print de", icon: Camera, tone: "text-sky-300 bg-sky-500/10 ring-sky-500/30" },
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
        {viewerId && viewerId !== item.user.id && <ReportButton targetType="ACTIVITY" targetId={item.id} />}
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
          {isPlatinum && item.game.platinumRarity !== null && (
            <p className="text-xs text-zinc-400">
              Só{" "}
              <strong className={item.game.platinumRarity < RARE_PERCENT ? "text-fuchsia-300" : "text-amber-200"}>
                {formatRarity(item.game.platinumRarity)}
              </strong>{" "}
              dos jogadores têm essa platina{item.game.platinumRarity < RARE_PERCENT && " 💎"}
            </p>
          )}
          {item.rating && (
            <div>
              <RatingStars value={item.rating} />
            </div>
          )}
          {item.type === "RARE_ACHIEVEMENT" && item.meta?.name && (
            <div className="flex items-center gap-3 rounded-xl bg-fuchsia-500/[0.07] p-2.5 ring-1 ring-fuchsia-500/30">
              {item.meta.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.meta.icon} alt="" className="size-11 shrink-0 rounded-md ring-1 ring-white/10" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-50">{item.meta.name}</p>
                {item.meta.description && <p className="line-clamp-2 text-xs text-zinc-400">{item.meta.description}</p>}
                {item.meta.percent != null && (
                  <p className="text-xs text-fuchsia-300">💎 só {formatRarity(item.meta.percent)} dos jogadores têm</p>
                )}
              </div>
            </div>
          )}
          {item.review && <Review text={item.review} spoiler={item.containsSpoiler} />}
        </div>
      </div>

      {/* Print com a largura do card (no celular a coluna ao lado da capa é estreita demais) */}
      {item.imageUrl && (
        <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={`Print de ${item.game.title}`}
            loading="lazy"
            className="max-h-[28rem] w-full rounded-xl bg-black/40 object-contain ring-1 ring-white/10"
          />
        </a>
      )}

      <footer className="-mx-1.5 mt-3 flex items-center gap-1 border-t border-zinc-800/80 pt-2">
        <ReactionButton activityId={item.id} type="LIKE" active={item.likedByMe} count={item.likeCount} canReact={Boolean(viewerId)} />
        {(item.type === "PLATINUM" || item.type === "COMPLETED") && (
          <ReactionButton activityId={item.id} type="GG" active={item.ggByMe} count={item.ggCount} canReact={Boolean(viewerId)} />
        )}
        <Link
          href={`/p/${item.id}#comentarios`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 sm:min-h-0 sm:px-2.5"
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
  if (!spoiler) return <MentionText text={text} className="block whitespace-pre-line text-sm text-zinc-300" />;
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none text-amber-300/90 group-open:mb-1">Contém spoiler — clique para ver</summary>
      <MentionText text={text} className="block whitespace-pre-line text-zinc-300" />
    </details>
  );
}
