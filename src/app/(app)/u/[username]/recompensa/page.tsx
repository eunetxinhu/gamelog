import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SITE_NAME } from "@/lib/brand";
import { SharePoster } from "./share-poster";
import { posterUrl } from "@/lib/bounty";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const username = decodeURIComponent((await params).username).toLowerCase();
  return {
    title: `Cartaz de @${username}`,
    openGraph: { title: `Procurado: @${username}`, images: [{ url: `/u/${username}/recompensa.png`, width: 800, height: 1130 }] },
  };
}

/** Página do cartaz de "Procurado": a imagem, e os botões para compartilhar ou baixar. */
export default async function BountyPage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const user = await prisma.user.findUnique({ where: { username }, select: { username: true, displayName: true, bannedAt: true } });
  if (!user || user.bannedAt) notFound();
  const name = user.displayName ?? user.username;
  const src = posterUrl(user.username);

  return (
    <main className="mx-auto max-w-lg px-4 py-5 sm:py-8">
      <Link href={`/u/${user.username}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="size-4" aria-hidden /> {name}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-zinc-50">Cartaz de recompensa</h1>
      <p className="mb-5 text-sm text-zinc-400">
        A recompensa sobe com platinas (as raras valem mais), jogos finalizados, conquistas, horas, reviews e seguidores.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`Cartaz de procurado de ${name}`} width={800} height={1130} className="mx-auto mb-5 w-full max-w-sm rounded-lg shadow-2xl shadow-black/60" />
      <SharePoster src={src} filename={`procurado-${user.username}.png`} text={`Minha recompensa no ${SITE_NAME} 🏴‍☠️`} />
    </main>
  );
}
