import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CalendarClock, History, PartyPopper, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWishlistReleases, type ReleaseGame } from "@/lib/releases";
import { monthLabel, untilLabel, type ReleaseItem } from "@/lib/release-calendar";
import { GameCover } from "@/components/game-cover";

export const metadata: Metadata = { title: "Lançamentos" };

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

/** Calendário dos jogos da wishlist: o que lança hoje, nos próximos meses e o que acabou de sair. */
export default async function ReleasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/lancamentos");

  const [{ today, calendar, total }, pushDevices] = await Promise.all([
    getWishlistReleases(user.id),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
  ]);
  const upcomingCount = calendar.upcoming.reduce((n, m) => n + m.items.length, 0);
  const empty = calendar.today.length + upcomingCount + calendar.undated.length + calendar.recent.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-50">
        <CalendarClock className="size-6 text-ember-400" aria-hidden /> Lançamentos
      </h1>
      <p className="mb-5 text-sm text-zinc-400">
        Os jogos da sua wishlist que ainda vão sair. No dia do lançamento você recebe um aviso
        {pushDevices > 0 ? " no celular." : "."}
      </p>

      {pushDevices === 0 && !empty && (
        <Link
          href="/settings/privacy"
          className="mb-6 flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/[0.07] px-4 py-3 text-sm text-brand-100 transition hover:border-brand-400/60"
        >
          <BellRing className="size-4 shrink-0" aria-hidden />
          Ative as notificações push para ser avisado no celular no dia em que o jogo sair.
        </Link>
      )}

      {empty ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">
          {total === 0 ? "Sua wishlist está vazia." : "Nenhum jogo da sua wishlist tem lançamento marcado."}{" "}
          Na página de um jogo que ainda vai sair, toque em “Quero jogar”. Veja os que estão{" "}
          <Link href="/games" className="text-brand-400 hover:underline">
            chegando em breve
          </Link>
          .
        </div>
      ) : (
        <div className="space-y-8">
          {calendar.today.length > 0 && (
            <Group title="Lança hoje" icon={<PartyPopper className="size-4 text-ember-300" aria-hidden />}>
              {calendar.today.map((item) => (
                <Row key={item.game.id} item={item} today={today} highlight />
              ))}
            </Group>
          )}

          {calendar.upcoming.map(({ month, items }) => (
            <Group key={month} title={monthLabel(month)} icon={<Sparkles className="size-4 text-brand-400" aria-hidden />}>
              {items.map((item) => (
                <Row key={item.game.id} item={item} today={today} />
              ))}
            </Group>
          ))}

          {calendar.undated.length > 0 && (
            <Group title="Sem data exata" icon={<CalendarClock className="size-4 text-zinc-400" aria-hidden />}>
              {calendar.undated.map((item) => (
                <Row key={item.game.id} item={item} today={today} />
              ))}
            </Group>
          )}

          {calendar.recent.length > 0 && (
            <Group title="Lançados nos últimos 30 dias" icon={<History className="size-4 text-emerald-400" aria-hidden />}>
              {calendar.recent.map((item) => (
                <Row key={item.game.id} item={item} today={today} />
              ))}
            </Group>
          )}

          <p className="text-center text-xs text-zinc-600">
            As datas vêm da loja da Steam (ou da RAWG) e são conferidas todo dia. Adiamentos aparecem aqui sozinhos.
          </p>
        </div>
      )}
    </main>
  );
}

function Group({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400 first-letter:uppercase">
        {icon}
        <span className="first-letter:uppercase">{title}</span>
      </h2>
      <ul className="divide-y divide-zinc-800/80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">{children}</ul>
    </section>
  );
}

function Row({ item, today, highlight }: { item: ReleaseItem<ReleaseGame>; today: string; highlight?: boolean }) {
  const date = item.day ? new Date(`${item.day}T00:00:00Z`) : null;
  return (
    <li>
      <Link
        href={`/games/${item.game.slug}`}
        className={`flex items-center gap-4 px-4 py-3 transition hover:bg-zinc-800/60 ${highlight ? "bg-ember-500/[0.07]" : ""}`}
      >
        <span className="w-12 shrink-0 text-center">
          {date ? (
            <>
              <span className="block text-[11px] uppercase text-zinc-500">{weekdayFmt.format(date).replace(".", "")}</span>
              <span className="block text-xl font-bold leading-6 text-zinc-100">{date.getUTCDate()}</span>
              <span className="block text-[11px] text-zinc-400">{monthFmt.format(date).replace(".", "")}</span>
            </>
          ) : (
            <span className="block text-lg text-zinc-600">?</span>
          )}
        </span>
        <span className="w-10 shrink-0">
          <GameCover title={item.game.title} coverUrl={item.game.coverUrl} steamAppId={item.game.steamAppId} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-100">{item.game.title}</span>
          <span className={`text-xs ${highlight ? "text-ember-300" : "text-zinc-500"}`}>
            {item.day ? untilLabel(today, item.day) : (item.text ?? "Em breve")}
          </span>
        </span>
      </Link>
    </li>
  );
}
