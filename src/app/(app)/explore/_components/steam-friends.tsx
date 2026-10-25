import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getFriendList } from "@/lib/steam/api";
import { blockedIds } from "@/lib/privacy";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";

const STEAM_PRIVACY_URL = "https://steamcommunity.com/my/edit/settings";

/** Amigos da Steam que já estão no GameLog (carregado em <Suspense> no Explorar). */
export async function SteamFriends({ viewerId, steamId }: { viewerId: string; steamId: string }) {
  const friendIds = await getFriendList(steamId);

  if (friendIds === null) {
    return (
      <Box>
        <p className="text-sm text-zinc-400">
          Sua lista de amigos da Steam está privada, então não conseguimos ver quem já está aqui. Em{" "}
          <strong className="text-zinc-200">Configurações de privacidade → Lista de amigos</strong>, escolha <strong className="text-zinc-200">Pública</strong>.
        </p>
        <a href={STEAM_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-sky-400 hover:underline">
          Abrir privacidade da Steam <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </Box>
    );
  }

  const hidden = await blockedIds(viewerId);
  const friends = friendIds.length
    ? await prisma.user.findMany({
        where: { steamId: { in: friendIds }, bannedAt: null, id: { notIn: [viewerId, ...hidden] } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          steamAvatarUrl: true,
          isPrivate: true,
          followers: { where: { followerId: viewerId }, select: { status: true } },
        },
      })
    : [];

  if (friends.length === 0) {
    return (
      <Box>
        <p className="text-sm text-zinc-400">Nenhum dos seus {friendIds.length} amigos da Steam está no GameLog ainda. Que tal convidar? Seu link de convite fica em Configurações → Privacidade.</p>
      </Box>
    );
  }

  return (
    <Box>
      <ul className="grid gap-3 sm:grid-cols-2">
        {friends.map((f) => {
          const name = f.displayName ?? f.username;
          return (
            <li key={f.id} className="flex items-center gap-3">
              <Link href={`/u/${f.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} src={f.avatarUrl ?? f.steamAvatarUrl} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-100">{name}</span>
                  <span className="block truncate text-xs text-zinc-500">@{f.username}</span>
                </span>
              </Link>
              <FollowButton userId={f.id} state={f.followers[0]?.status ?? null} isPrivate={f.isPrivate} />
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <section className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="mb-3 text-lg font-semibold text-zinc-50">Seus amigos da Steam no GameLog</h2>
      {children}
    </section>
  );
}
