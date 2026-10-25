import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { AccountForm, type GameOption } from "./_components/account-form";
import { ProfileCardEmbed } from "./_components/profile-card-embed";
import { appUrl } from "@/lib/app-url";

export const metadata: Metadata = { title: "Editar perfil" };

const gameSelect = { id: true, title: true, coverUrl: true, steamAppId: true } as const;

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings/account");

  const [favorites, logged, library] = await Promise.all([
    prisma.favoriteGame.findMany({ where: { userId: user.id }, select: { position: true, game: { select: gameSelect } } }),
    prisma.gameLog.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, select: { game: { select: gameSelect } } }),
    prisma.libraryEntry.findMany({
      where: { userId: user.id, playtimeMinutes: { gt: 0 } },
      orderBy: { playtimeMinutes: "desc" },
      take: 500,
      select: { game: { select: gameSelect } },
    }),
  ]);

  // Opções do Top 4: jogos registrados primeiro, depois a biblioteca por horas jogadas
  const options = new Map<string, GameOption>();
  for (const { game } of [...logged, ...library]) options.set(game.id, game);

  const slots: (GameOption | null)[] = [null, null, null, null];
  for (const f of favorites) if (f.position >= 1 && f.position <= 4) slots[f.position - 1] = f.game;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <AccountForm
        username={user.username}
        steamAvatarUrl={user.steamAvatarUrl}
        profile={{
          displayName: user.displayName ?? "",
          bio: user.bio ?? "",
          avatarUrl: user.avatarUrl ?? "",
          bannerUrl: user.bannerUrl ?? "",
        }}
        favorites={slots}
        options={[...options.values()]}
        canUpload={hasSupabaseAdmin()}
      />

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-50">Card do perfil</h2>
        <p className="mb-4 text-sm text-zinc-400">Mostre seu Poneglyph.gg na assinatura de fórum, no README do GitHub ou na bio.</p>
        <ProfileCardEmbed username={user.username} origin={appUrl()} />
      </section>
    </main>
  );
}
