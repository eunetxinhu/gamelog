import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Newspaper, Share2, Target, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActivities } from "@/lib/activity";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { ActivityCard } from "@/components/activity-card";
import { SITE_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · Sua vida gamer, platina por platina` },
  description: "Conecte sua Steam, mostre suas platinas automaticamente e acompanhe o que seus amigos estão jogando.",
};

/** Landing para quem não está logado. Logado vai direto para o feed. */
export default async function Home() {
  if (await getCurrentUser()) redirect("/feed");

  const [platinums, stats] = await Promise.all([
    getActivities({ where: { type: "PLATINUM" }, viewerId: null, take: 3 }).then(async (p) =>
      p.length > 0 ? p : getActivities({ viewerId: null, take: 3 }),
    ),
    Promise.all([prisma.user.count(), prisma.activity.count({ where: { type: "PLATINUM" } }), prisma.game.count()]),
  ]);
  const [players, platinumCount, games] = stats;
  const steamLogin = hasSupabaseAdmin();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <BrandLogo className="h-8" />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            Entrar
          </Link>
          <Link href="/signup" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
            Criar conta
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        {/* ---- Hero ----------------------------------------------------------- */}
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              <Trophy className="size-3.5" aria-hidden /> A rede social de quem caça platinas
            </p>
            <h1 className="text-4xl font-extrabold leading-tight text-zinc-50 sm:text-5xl">
              Sua vida gamer,
              <br />
              <span className="bg-gradient-to-r from-brand-400 to-ember-400 bg-clip-text text-transparent">platina por platina.</span>
            </h1>
            <p className="mt-4 max-w-md text-zinc-400">
              Conecte sua Steam e o Poneglyph.gg mostra sozinho os jogos que você começou, as platinas que conquistou e as horas
              jogadas. Avalie, comente e acompanhe seus amigos.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {steamLogin && (
                <a
                  href="/api/steam/login"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1b2838] px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-[#2a475e]"
                >
                  Entrar com Steam
                </a>
              )}
              <Link
                href="/signup"
                className="inline-flex items-center rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                Criar conta com e-mail
              </Link>
            </div>
            {players > 1 && (
              <p className="mt-6 text-sm text-zinc-500">
                <strong className="text-zinc-300">{players.toLocaleString("pt-BR")}</strong> jogadores ·{" "}
                <strong className="text-amber-300">{platinumCount.toLocaleString("pt-BR")}</strong> platinas compartilhadas ·{" "}
                <strong className="text-zinc-300">{games.toLocaleString("pt-BR")}</strong> jogos
              </p>
            )}
          </div>

          {platinums.length > 0 && (
            <div className="space-y-4" aria-label="Últimas publicações da comunidade">
              {platinums.map((item) => (
                <ActivityCard key={item.id} item={item} viewerId={null} />
              ))}
            </div>
          )}
        </section>

        {/* ---- Recursos ------------------------------------------------------- */}
        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<Trophy className="size-5 text-amber-400" aria-hidden />} title="Platinas automáticas">
            Ao completar 100% das conquistas na Steam, a platina aparece no seu perfil e no feed, com a raridade.
          </Feature>
          <Feature icon={<Target className="size-5 text-brand-400" aria-hidden />} title="Quase platinando">
            Veja os jogos em que falta pouco e as conquistas mais fáceis que ainda faltam.
          </Feature>
          <Feature icon={<Newspaper className="size-5 text-emerald-400" aria-hidden />} title="Feed dos amigos">
            Siga jogadores, mande GG nas platinas, curta e comente reviews.
          </Feature>
          <Feature icon={<Share2 className="size-5 text-ember-400" aria-hidden />} title="Compartilhe">
            Cada perfil e publicação vira um card bonito no WhatsApp, Discord e X.
          </Feature>
        </section>
      </main>

      <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-500">
        Poneglyph.gg · não afiliado à Valve. Dados de jogos da Steam.
      </footer>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-3 inline-flex rounded-lg bg-zinc-800 p-2">{icon}</div>
      <h2 className="font-semibold text-zinc-50">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{children}</p>
    </div>
  );
}
