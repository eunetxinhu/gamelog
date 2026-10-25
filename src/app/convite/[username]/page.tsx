import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getProgression } from "@/lib/progression";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { Avatar } from "@/components/avatar";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const username = decodeURIComponent((await params).username);
  return {
    title: `@${username} te convidou para o GameLog`,
    description: "Conecte sua Steam, mostre suas platinas e acompanhe o que seus amigos estão jogando.",
  };
}

/** Página do link de convite: quem convidou + criar conta (a conta nova já segue quem convidou). */
export default async function InvitePage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const inviter = await prisma.user.findFirst({
    where: { username, bannedAt: null },
    select: { id: true, username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true },
  });
  if (!inviter) notFound();
  if (await getCurrentUser()) redirect(`/u/${inviter.username}`);

  const { stats, level } = await getProgression(inviter.id);
  const name = inviter.displayName ?? inviter.username;
  const ref = encodeURIComponent(inviter.username);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto w-fit">
          <Avatar name={name} src={inviter.avatarUrl ?? inviter.steamAvatarUrl} size="lg" />
        </div>
        <p className="mt-4 text-sm text-zinc-400">
          <strong className="text-zinc-100">{name}</strong> te convidou para o
        </p>
        <h1 className="text-3xl font-extrabold text-zinc-50">GameLog</h1>
        <p className="mt-2 text-sm text-zinc-400">A rede social de quem joga e caça platinas. Conecte sua Steam e seu perfil se monta sozinho.</p>

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-zinc-950/60 p-3">
            <p className="text-xl font-bold text-zinc-50">Nv. {level.level}</p>
            <p className="text-[11px] text-zinc-500">nível</p>
          </div>
          <div className="rounded-xl bg-zinc-950/60 p-3">
            <p className="flex items-center justify-center gap-1 text-xl font-bold text-amber-300">
              <Trophy className="size-4" aria-hidden /> {stats.platinums}
            </p>
            <p className="text-[11px] text-zinc-500">platinas</p>
          </div>
          <div className="rounded-xl bg-zinc-950/60 p-3">
            <p className="text-xl font-bold text-zinc-50">{stats.games}</p>
            <p className="text-[11px] text-zinc-500">jogos</p>
          </div>
        </div>

        <div className="mt-7 space-y-2">
          {hasSupabaseAdmin() && (
            <a href={`/api/steam/login?ref=${ref}`} className="block rounded-lg bg-[#1b2838] px-4 py-3 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-[#2a475e]">
              Criar conta com Steam
            </a>
          )}
          <Link href={`/signup?ref=${ref}`} className="block rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500">
            Criar conta com e-mail
          </Link>
          <p className="pt-2 text-xs text-zinc-500">Você já começa seguindo @{inviter.username}.</p>
        </div>
      </section>
    </main>
  );
}
