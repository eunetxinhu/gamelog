import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { visibleUsersWhere } from "@/lib/privacy";
import { relativeTime, STATUS_LABEL } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";

/** Filtros das reviews (na URL: ?reviews=positivas). */
const FILTERS = {
  todas: { label: "Todas", ratings: undefined },
  positivas: { label: "Positivas", ratings: [4, 5] },
  mistas: { label: "Mistas", ratings: [3] },
  negativas: { label: "Negativas", ratings: [1, 2] },
} as const;

export type ReviewFilter = keyof typeof FILTERS;

export function parseReviewFilter(value: string | undefined): ReviewFilter {
  return value && value in FILTERS ? (value as ReviewFilter) : "todas";
}

/** Reviews escritas da comunidade, com filtro por nota (estilo Metacritic). */
export async function GameReviews({ gameId, slug, filter, viewerId }: { gameId: string; slug: string; filter: ReviewFilter; viewerId: string | null }) {
  const base = { gameId, review: { not: null }, user: await visibleUsersWhere(viewerId) };
  const [reviews, counts] = await Promise.all([
    prisma.gameLog.findMany({
      where: { ...base, ...(FILTERS[filter].ratings ? { rating: { in: [...FILTERS[filter].ratings] } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: { user: { select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } } },
    }),
    prisma.gameLog.groupBy({ by: ["rating"], where: base, _count: { _all: true } }),
  ]);

  const countFor = (key: ReviewFilter) => {
    const ratings: readonly number[] | undefined = FILTERS[key].ratings;
    return counts.filter((c) => !ratings || (c.rating !== null && ratings.includes(c.rating))).reduce((n, c) => n + c._count._all, 0);
  };
  if (countFor("todas") === 0) return null;

  return (
    <section id="reviews" className="mt-10 scroll-mt-20">
      <h2 className="mb-3 text-lg font-semibold text-zinc-50">Reviews da comunidade</h2>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtrar reviews">
        {(Object.keys(FILTERS) as ReviewFilter[]).map((key) => (
          <Link
            key={key}
            href={`/games/${slug}?reviews=${key}#reviews`}
            scroll={false}
            aria-current={key === filter ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              key === filter ? "bg-zinc-100 font-medium text-zinc-900" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {FILTERS[key].label} <span className="opacity-60">{countFor(key)}</span>
          </Link>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma review nessa categoria.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const name = r.user.displayName ?? r.user.username;
            return (
              <li key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="mb-2 flex items-center gap-3">
                  <Link href={`/u/${r.user.username}`}>
                    <Avatar name={name} src={r.user.avatarUrl ?? r.user.steamAvatarUrl} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${r.user.username}`} className="font-semibold text-zinc-100 hover:underline">
                      {name}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {STATUS_LABEL[r.status]} · {relativeTime(r.updatedAt)}
                    </p>
                  </div>
                  {r.rating && <RatingStars value={r.rating} />}
                </div>
                {r.containsSpoiler ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-amber-300/90">Contém spoiler — clique para ver</summary>
                    <p className="mt-1 whitespace-pre-line text-zinc-300">{r.review}</p>
                  </details>
                ) : (
                  <p className="whitespace-pre-line text-sm text-zinc-300">{r.review}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
