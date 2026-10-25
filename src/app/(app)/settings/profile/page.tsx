import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ProfileConnectionsForm } from "./_components/profile-connections-form";
import { STEAM_LINK_MESSAGES, type SteamLinkErrorCode, type SteamSyncError } from "./_actions/types";

export const metadata: Metadata = { title: "Contas vinculadas" };

type Props = { searchParams: Promise<{ steam?: string; steam_error?: string }> };

export default async function ProfileSettingsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings/profile");

  const [library, query] = await Promise.all([
    prisma.libraryEntry.aggregate({
      where: { userId: user.id, source: "STEAM" },
      _count: { _all: true },
      _sum: { playtimeMinutes: true },
    }),
    searchParams,
  ]);

  // Resultado do "Entrar com Steam" (src/app/api/steam/callback)
  const linkErrorCode = query.steam_error as SteamLinkErrorCode | undefined;
  const linkError: SteamSyncError | null =
    linkErrorCode && linkErrorCode in STEAM_LINK_MESSAGES
      ? { code: linkErrorCode, message: STEAM_LINK_MESSAGES[linkErrorCode] }
      : null;

  return (
    <main className="px-4 py-8">
      <ProfileConnectionsForm
        steam={{
          steamId: user.steamId,
          personaName: user.steamPersonaName,
          avatarUrl: user.steamAvatarUrl,
          lastSyncAt: user.steamLastSyncAt?.toISOString() ?? null,
          gamesCount: library._count._all,
          totalHours: Math.round((library._sum.playtimeMinutes ?? 0) / 60),
        }}
        justLinked={query.steam === "linked" && Boolean(user.steamId)}
        linkError={linkError}
      />
    </main>
  );
}
