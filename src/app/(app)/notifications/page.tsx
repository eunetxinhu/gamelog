import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Heart, MessageCircle, Percent, Trophy, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { GameCover } from "@/components/game-cover";
import { MarkRead } from "./_components/mark-read";

export const metadata: Metadata = { title: "Notificações · GameLog" };

const TYPE = {
  LIKE: { icon: Heart, tone: "text-rose-400", text: "curtiu sua publicação" },
  GG: { icon: Trophy, tone: "text-amber-400", text: "mandou GG 🏆 pra você" },
  COMMENT: { icon: MessageCircle, tone: "text-sky-400", text: "comentou na sua publicação" },
  FOLLOW: { icon: UserPlus, tone: "text-emerald-400", text: "começou a seguir você" },
  PLATINUM: { icon: Trophy, tone: "text-amber-400", text: "platinou" },
  DEAL: { icon: Percent, tone: "text-emerald-400", text: "entrou em promoção" },
  WEEKLY: { icon: CalendarDays, tone: "text-sky-400", text: "Seu resumo da semana está pronto" },
} as const;

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");

  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      actor: { select: { username: true, displayName: true, avatarUrl: true, steamAvatarUrl: true } },
      activity: { select: { id: true, game: { select: { title: true } } } },
      game: { select: { slug: true, title: true, coverUrl: true, steamAppId: true, discountPercent: true, priceFinal: true } },
    },
  });
  const hasUnread = items.some((n) => !n.readAt);
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-5 text-2xl font-bold text-zinc-50">Notificações</h1>
      {hasUnread && <MarkRead />}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Nada por aqui ainda. Quando alguém curtir, comentar ou seguir você, aparece aqui.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          {items.map((n) => {
            const t = TYPE[n.type];
            const Icon = t.icon;
            const actorName = n.actor ? (n.actor.displayName ?? n.actor.username) : null;

            let href = "/notifications";
            if (n.type === "DEAL" && n.game) href = `/games/${n.game.slug}`;
            else if (n.type === "WEEKLY") href = `/u/${user.username}/semana`;
            else if (n.activity) href = `/p/${n.activity.id}${n.type === "COMMENT" ? "#comentarios" : ""}`;
            else if (n.actor) href = `/u/${n.actor.username}`;

            return (
              <li key={n.id}>
                <Link href={href} className={`flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-800/60 ${n.readAt ? "" : "bg-sky-500/[0.06]"}`}>
                  <div className="relative shrink-0">
                    {n.actor ? (
                      <Avatar name={actorName!} src={n.actor.avatarUrl ?? n.actor.steamAvatarUrl} size="sm" />
                    ) : n.game ? (
                      <span className="block w-9">
                        <GameCover title={n.game.title} coverUrl={n.game.coverUrl} steamAppId={n.game.steamAppId} />
                      </span>
                    ) : (
                      <span className="flex size-9 items-center justify-center rounded-full bg-zinc-800">
                        <Icon className={`size-4 ${t.tone}`} aria-hidden />
                      </span>
                    )}
                    {(n.actor || n.game) && (
                      <span className="absolute -bottom-1 -right-1 rounded-full bg-zinc-950 p-0.5">
                        <Icon className={`size-3.5 ${t.tone} ${n.type === "LIKE" ? "fill-rose-400" : ""}`} aria-hidden />
                      </span>
                    )}
                  </div>
                  <p className="min-w-0 flex-1 text-sm text-zinc-300">
                    {n.type === "DEAL" && n.game ? (
                      <>
                        <strong className="text-zinc-100">{n.game.title}</strong>, da sua wishlist, {t.text}
                        {n.game.discountPercent ? (
                          <span className="text-emerald-400">
                            {" "}
                            · -{n.game.discountPercent}%{n.game.priceFinal ? ` por ${brl.format(n.game.priceFinal / 100)}` : ""}
                          </span>
                        ) : null}
                      </>
                    ) : n.type === "WEEKLY" ? (
                      <strong className="text-zinc-100">{t.text}</strong>
                    ) : (
                      <>
                        <strong className="text-zinc-100">{actorName}</strong> {t.text}
                        {n.activity && n.type === "PLATINUM" && <strong className="text-zinc-100"> {n.activity.game.title}</strong>}
                        {n.activity && n.type !== "PLATINUM" && <span className="text-zinc-500"> · {n.activity.game.title}</span>}
                      </>
                    )}
                  </p>
                  <span className="shrink-0 text-xs text-zinc-500">{relativeTime(n.createdAt)}</span>
                  {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-sky-400" aria-label="Não lida" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
