import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, CalendarDays, ChevronRight, GitCompareArrows, Lock, Settings, Target, Trophy, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActivities } from "@/lib/activity";
import { formatPlaytime } from "@/lib/format";
import { getNearPlatinum, getPlatinums, getPlaying } from "@/lib/profile-games";
import { formatRarity, RARE_PERCENT } from "@/lib/rarity";
import { ActivityCard } from "@/components/activity-card";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { LevelBadge } from "@/components/level-badge";
import { getProgression } from "@/lib/progression";
import { canSeeProfile } from "@/lib/privacy";
import { canMessage } from "@/lib/dm";
import { ProfileMenu } from "@/components/profile-menu";
import { GameCover } from "@/components/game-cover";

type Props = { params: Promise<{ username: string }> };

const gameSelect = { id: true, slug: true, title: true, coverUrl: true, steamAppId: true } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)} · GameLog` };
}

export default async function ProfilePage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const [profile, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      include: { _count: { select: { followers: { where: { status: "ACCEPTED" } }, following: { where: { status: "ACCEPTED" } } } } },
    }),
    getCurrentUser(),
  ]);
  if (!profile) notFound();

  const isMe = viewer?.id === profile.id;
  const other = Boolean(viewer && !isMe);

  const [canSee, following, blockedByMe, dm] = await Promise.all([
    canSeeProfile(viewer?.id ?? null, profile),
    other ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewer!.id, followingId: profile.id } } }) : null,
    other ? prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: viewer!.id, blockedId: profile.id } } }).then(Boolean) : false,
    other ? canMessage(viewer!.id, profile) : null,
  ]);

  // Sem acesso (privado, suspenso ou bloqueio): só o cabeçalho e um aviso
  const data = canSee ? await loadProfileContent(profile.id, viewer?.id ?? null) : null;
  const name = profile.displayName ?? profile.username;
  const gamesHref = (aba: string) => `/u/${profile.username}/jogos?aba=${aba}`;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* ---- Cabeçalho ------------------------------------------------------ */}
      <header className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="h-32 bg-gradient-to-br from-sky-900/60 via-zinc-900 to-violet-900/60 sm:h-44">
          {profile.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.bannerUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="-mt-12 w-fit rounded-full ring-4 ring-zinc-950">
            <Avatar name={name} src={profile.avatarUrl ?? profile.steamAvatarUrl} size="lg" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate text-2xl font-bold text-zinc-50">{name}</h1>
            <p className="text-sm text-zinc-400">@{profile.username}</p>
            {data && (
              <Link href={`/u/${profile.username}/selos`} className="block pt-1" title="Ver nível e selos">
                <LevelBadge level={data.progression.level} />
              </Link>
            )}
            {profile.bio && <p className="max-w-prose pt-1 text-sm text-zinc-300">{profile.bio}</p>}
            <p className="flex gap-4 pt-2 text-sm text-zinc-400">
              <span>
                <strong className="text-zinc-100">{profile._count.followers}</strong> seguidores
              </span>
              <span>
                <strong className="text-zinc-100">{profile._count.following}</strong> seguindo
              </span>
            </p>
          </div>
          <div className="shrink-0">
            {isMe ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/settings/account"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
                >
                  <Settings className="size-4" aria-hidden /> Editar perfil
                </Link>
                <Link
                  href="/settings/privacy"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
                >
                  <UserPlus className="size-4" aria-hidden /> Convidar
                </Link>
              </div>
            ) : viewer ? (
              <div className="flex flex-wrap gap-2">
                {!blockedByMe && !profile.bannedAt && <FollowButton userId={profile.id} state={following?.status ?? null} isPrivate={profile.isPrivate} />}
                {canSee && (
                  <Link
                    href={`/u/${profile.username}/comparar`}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
                  >
                    <GitCompareArrows className="size-4" aria-hidden /> Comparar
                  </Link>
                )}
                <ProfileMenu userId={profile.id} username={profile.username} blocked={blockedByMe} canMessage={Boolean(dm?.ok)} />
              </div>
            ) : (
              <Link href={`/login?next=/u/${profile.username}`} className="text-sm text-sky-400 hover:underline">
                Entre para seguir
              </Link>
            )}
          </div>
        </div>
      </header>

      {!data ? (
        <LockedNotice
          text={
            blockedByMe
              ? "Você bloqueou este perfil. Para ver o conteúdo, desbloqueie no menu ⋯."
              : profile.bannedAt
                ? "Esta conta foi suspensa pela moderação."
                : profile.isPrivate
                  ? "Este perfil é privado. Siga para pedir acesso: se aprovar, você vê a atividade e os jogos."
                  : "Este perfil não está disponível."
          }
        />
      ) : (
        <ProfileContent data={data} profile={profile} isMe={isMe} gamesHref={gamesHref} />
      )}
    </main>
  );
}

/** Tudo que só aparece para quem pode ver o perfil. */
async function loadProfileContent(profileId: string, viewerId: string | null) {
  const [library, completedLogs, platinumList, playing, nearPlatinum, mostPlayed, activities, favorites, progression, wishlist] = await Promise.all([
    prisma.libraryEntry.aggregate({ where: { userId: profileId }, _count: { _all: true }, _sum: { playtimeMinutes: true } }),
    prisma.gameLog.findMany({ where: { userId: profileId, status: "COMPLETED" }, select: { gameId: true } }),
    getPlatinums(profileId),
    getPlaying(profileId, 6),
    getNearPlatinum(profileId, 6),
    prisma.libraryEntry.findMany({
      where: { userId: profileId, playtimeMinutes: { gt: 0 } },
      orderBy: { playtimeMinutes: "desc" },
      take: 12,
      select: { playtimeMinutes: true, achievementsUnlocked: true, achievementsTotal: true, game: { select: gameSelect } },
    }),
    getActivities({ where: { userId: profileId }, viewerId, take: 20 }),
    prisma.favoriteGame.findMany({ where: { userId: profileId }, orderBy: { position: "asc" }, select: { game: { select: gameSelect } } }),
    getProgression(profileId),
    prisma.wishlistItem.findMany({ where: { userId: profileId }, orderBy: { createdAt: "desc" }, take: 6, select: { game: { select: gameSelect } } }),
  ]);
  // Finalizados inclui as platinas (platinar implica ter terminado)
  const completedCount = new Set([...completedLogs.map((l) => l.gameId), ...platinumList.map((p) => p.game.id)]).size;
  return { library, completedCount, platinumList, playing, nearPlatinum, mostPlayed, activities, favorites, progression, wishlist, viewerId };
}

function LockedNotice({ text }: { text: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
      <Lock className="size-8 text-zinc-500" aria-hidden />
      <p className="max-w-sm text-sm text-zinc-400">{text}</p>
    </div>
  );
}

function ProfileContent({
  data,
  profile,
  isMe,
  gamesHref,
}: {
  data: NonNullable<Awaited<ReturnType<typeof loadProfileContent>>>;
  profile: { username: string };
  isMe: boolean;
  gamesHref: (aba: string) => string;
}) {
  const { library, completedCount, platinumList, playing, nearPlatinum, mostPlayed, activities, favorites, progression, wishlist, viewerId } = data;
  const earnedBadges = progression.badges.filter((b) => b.earned);

  return (
    <>

      {/* ---- Top 4 ---------------------------------------------------------- */}
      {favorites.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Favoritos</h2>
          <ul className="grid grid-cols-4 gap-3 sm:gap-4">
            {favorites.map(({ game }) => (
              <li key={game.id}>
                <Link href={`/games/${game.slug}`} title={game.title} className="group block">
                  <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} className="transition group-hover:ring-sky-500" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Selos ---------------------------------------------------------- */}
      <Link
        href={`/u/${profile.username}/selos`}
        className="mt-4 flex items-center gap-3 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 transition hover:border-zinc-600"
      >
        <span className="shrink-0 text-xs uppercase tracking-wide text-zinc-500">
          Selos {earnedBadges.length}/{progression.badges.length}
        </span>
        {earnedBadges.length === 0 ? (
          <span className="text-sm text-zinc-500">Nenhum ainda. Veja como conquistar →</span>
        ) : (
          <span className="flex gap-1.5">
            {earnedBadges.map((b) => (
              <span key={b.id} title={`${b.name}: ${b.description}`} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-lg ring-1 ring-amber-500/30">
                {b.emoji}
              </span>
            ))}
          </span>
        )}
        <ChevronRight className="ml-auto size-4 shrink-0 text-zinc-500" aria-hidden />
      </Link>

      <Link
        href={`/u/${profile.username}/semana`}
        className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300 transition hover:border-zinc-600"
      >
        <CalendarDays className="size-4 text-sky-400" aria-hidden />
        {isMe ? "Sua semana" : "Resumo da semana"}: jogos novos, finalizados e platinas dos últimos 7 dias
        <ChevronRight className="ml-auto size-4 shrink-0 text-zinc-500" aria-hidden />
      </Link>

      {/* ---- Números -------------------------------------------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat href={gamesHref("biblioteca")} label="Jogos" value={library._count._all.toLocaleString("pt-BR")} />
        <Stat href={gamesHref("biblioteca")} label="Horas jogadas" value={Math.round((library._sum.playtimeMinutes ?? 0) / 60).toLocaleString("pt-BR")} />
        <Stat href={gamesHref("finalizados")} label="Finalizados" value={completedCount.toLocaleString("pt-BR")} />
        <Stat href={gamesHref("platinas")} label="Platinas" value={platinumList.length.toLocaleString("pt-BR")} highlight />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* ---- Atividade ---------------------------------------------------- */}
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-zinc-50">Atividade</h2>
          {activities.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
              {isMe ? (
                <>
                  Você ainda não publicou nada.{" "}
                  <Link href="/games" className="text-sky-400 hover:underline">
                    Compartilhe um jogo
                  </Link>
                  .
                </>
              ) : (
                "Nenhuma publicação ainda."
              )}
            </p>
          ) : (
            <div className="space-y-4">
              {activities.map((a) => (
                <ActivityCard key={a.id} item={a} viewerId={viewerId} />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-10">
          {playing.length > 0 && (
            <ShelfSection title="Jogando agora" href={gamesHref("jogando")}>
              {playing.map(({ game, sub }) => (
                <Shelf key={game.id} game={game} sub={sub ?? undefined} />
              ))}
            </ShelfSection>
          )}

          {platinumList.length > 0 && (
            <ShelfSection title="Platinas" href={gamesHref("platinas")} icon={<Trophy className="size-4 text-amber-400" aria-hidden />}>
              {platinumList.slice(0, 9).map(({ game, rarity }) => (
                <Shelf
                  key={game.id}
                  game={game}
                  platinum
                  sub={rarity !== null ? `${rarity < RARE_PERCENT ? "💎 " : ""}${formatRarity(rarity)} dos jogadores` : undefined}
                />
              ))}
            </ShelfSection>
          )}

          {nearPlatinum.length > 0 && (
            <ShelfSection title="Quase platinando" href={gamesHref("quase")} icon={<Target className="size-4 text-sky-400" aria-hidden />}>
              {nearPlatinum.map(({ game, sub }) => (
                <Shelf key={game.id} game={game} sub={sub ?? undefined} />
              ))}
            </ShelfSection>
          )}

          {wishlist.length > 0 && (
            <ShelfSection title="Quero jogar" href={gamesHref("wishlist")} icon={<Bookmark className="size-4 text-emerald-400" aria-hidden />}>
              {wishlist.map(({ game }) => (
                <Shelf key={game.id} game={game} />
              ))}
            </ShelfSection>
          )}

          {mostPlayed.length > 0 && (
            <ShelfSection title="Mais jogados" href={gamesHref("biblioteca")}>
              {mostPlayed.map((e) => (
                <Shelf
                  key={e.game.id}
                  game={e.game}
                  sub={[
                    formatPlaytime(e.playtimeMinutes),
                    e.achievementsTotal ? `${e.achievementsUnlocked ?? 0}/${e.achievementsTotal} 🏅` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </ShelfSection>
          )}
        </div>
      </div>
    </>
  );
}

/** Número do perfil; clicar abre a lista de jogos daquela categoria. */
function Stat({ href, label, value, highlight }: { href: string; label: string; value: string; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`group rounded-xl border p-4 transition ${
        highlight ? "border-amber-500/40 bg-amber-500/[0.06] hover:border-amber-400/70" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
      }`}
    >
      <span className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
        {label}
        <ChevronRight className="size-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden />
      </span>
      <span className={`mt-1 block text-2xl font-bold ${highlight ? "text-amber-300" : "text-zinc-50"}`}>{value}</span>
    </Link>
  );
}

function ShelfSection({ title, href, icon, children }: { title: string; href: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
          {icon}
          {title}
        </h2>
        <Link href={href} className="text-xs font-medium text-sky-400 hover:underline">
          Ver todos
        </Link>
      </div>
      <ul className="grid grid-cols-3 gap-3">{children}</ul>
    </section>
  );
}

function Shelf({
  game,
  sub,
  platinum,
}: {
  game: { slug: string; title: string; coverUrl: string | null; steamAppId: number | null };
  sub?: string;
  platinum?: boolean;
}) {
  return (
    <li>
      <Link href={`/games/${game.slug}`} className="group block space-y-1" title={game.title}>
        <div className="relative">
          <GameCover
            title={game.title}
            coverUrl={game.coverUrl}
            steamAppId={game.steamAppId}
            className={platinum ? "ring-2 ring-amber-400/70" : "transition group-hover:ring-sky-500"}
          />
          {platinum && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-400 p-1 text-zinc-950 shadow">
              <Trophy className="size-3" aria-hidden />
            </span>
          )}
        </div>
        {sub && <p className="truncate text-[11px] text-zinc-400">{sub}</p>}
      </Link>
    </li>
  );
}
