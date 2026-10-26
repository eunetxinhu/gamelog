import type { ReactNode } from "react";
import { after } from "next/server";
import Link from "next/link";
import { Bell, CalendarClock, Compass, Gamepad2, ListOrdered, LogOut, Mail, Medal, Newspaper, Settings, ShieldAlert, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { unreadMessages } from "@/lib/dm";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/avatar";
import { signOut } from "../(auth)/_actions/auth";
import { SteamAutoSync } from "./_components/steam-auto-sync";
import { MobileNav } from "./_components/mobile-nav";
import { HeaderMenu } from "./_components/header-menu";
import { needsAutoSync, shouldTouchLastSeen } from "@/lib/steam/schedule";
import { upcomingWishlistCount } from "@/lib/releases";
import { SITE_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/brand-logo";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // Visita registrada (no máx. 1x por hora): define a frequência do sync da Steam
  if (user && shouldTouchLastSeen(user.lastSeenAt)) {
    const id = user.id;
    after(() => prisma.user.update({ where: { id }, data: { lastSeenAt: new Date() } }).then(() => undefined, () => undefined));
  }
  const [unread, unreadDms, openReports, releasesSoon] = user
    ? await Promise.all([
        unreadCount(user.id),
        unreadMessages(user.id),
        user.isAdmin ? prisma.report.count({ where: { status: "OPEN" } }) : 0,
        upcomingWishlistCount(user.id),
      ])
    : [0, 0, 0, 0];
  const needsSync = needsAutoSync(user);

  return (
    <>
      {/* Fundo com a arte do site, fixo atrás de tudo (a tela de login tem a própria arte) */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 top-14 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/fundo-2.jpg"
          srcSet="/brand/fundo-2-1280.jpg 1280w, /brand/fundo-2.jpg 1920w"
          sizes="max(100vw, 177.78vh)"
          alt=""
          className="size-full select-none object-cover"
        />
        {/* A arte já vem escurecida; esta camada só dá um pouco mais de contraste aos cards */}
        <div className="absolute inset-0 bg-black/30" />
      </div>
      <header className="sticky top-0 z-20 border-b border-brand-900/60 bg-black/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 xl:max-w-7xl">
          <div className="flex items-center gap-1 sm:gap-4">
            <Link href={user ? "/feed" : "/"} className="mr-2 shrink-0 pt-1" aria-label={`${SITE_NAME}: início`}>
              <BrandLogo className="h-8 md:h-7 xl:h-9" />
            </Link>
            {/* No celular estes links ficam na barra inferior (MobileNav) */}
            <div className="hidden items-center gap-1 md:flex lg:gap-3">
              <NavLink href="/feed" icon={<Newspaper className="size-4" aria-hidden />}>
                Feed
              </NavLink>
              <NavLink href="/games" icon={<Gamepad2 className="size-4" aria-hidden />}>
                Jogos
              </NavLink>
              <NavLink href="/explore" icon={<Compass className="size-4" aria-hidden />}>
                Explorar
              </NavLink>
              <NavLink href="/listas" icon={<ListOrdered className="size-4" aria-hidden />}>
                Listas
              </NavLink>
              <NavLink href="/ranking" icon={<Medal className="size-4" aria-hidden />}>
                Ranking
              </NavLink>
              <NavLink href="/clubes" icon={<Users className="size-4" aria-hidden />}>
                Clubes
              </NavLink>
            </div>
          </div>

          {user ? (
            <div className="flex min-w-0 items-center gap-0.5 sm:gap-2">
              {/* No celular o perfil fica na barra inferior; Configurações e Sair vão para o menu */}
              <Link
                href={`/u/${user.username}`}
                className="hidden min-w-0 items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-800 md:flex"
                title="Meu perfil"
              >
                <Avatar name={user.displayName ?? user.username} src={user.avatarUrl ?? user.steamAvatarUrl} size="sm" />
              </Link>
              {user.isAdmin && (
                <IconLink href="/moderacao" label={`Moderação (${openReports} denúncias abertas)`} count={openReports}>
                  <ShieldAlert className="size-5 md:size-4" aria-hidden />
                </IconLink>
              )}
              <IconLink href="/mensagens" label={unreadDms ? `Mensagens (${unreadDms} novas)` : "Mensagens"} count={unreadDms}>
                <Mail className="size-5 md:size-4" aria-hidden />
              </IconLink>
              <IconLink href="/notifications" label={unread ? `Notificações (${unread} novas)` : "Notificações"} count={unread}>
                <Bell className="size-5 md:size-4" aria-hidden />
              </IconLink>
              {/* No celular fica no menu ☰ */}
              <span className="hidden md:flex">
                <IconLink
                  href="/lancamentos"
                  label={releasesSoon ? `Lançamentos (${releasesSoon} da sua wishlist nos próximos 7 dias)` : "Lançamentos da wishlist"}
                  count={releasesSoon}
                >
                  <CalendarClock className="size-4" aria-hidden />
                </IconLink>
              </span>
              <Link
                href="/settings/account"
                className="hidden rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:block"
                aria-label="Configurações"
              >
                <Settings className="size-4" aria-hidden />
              </Link>
              <form action={signOut} className="hidden md:block">
                <button type="submit" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Sair">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
              <HeaderMenu username={user.username} />
            </div>
          ) : (
            <Link href="/login" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500">
              Entrar
            </Link>
          )}
        </nav>
      </header>
      {needsSync && <SteamAutoSync />}
      {children}
      <MobileNav
        user={user ? { username: user.username, name: user.displayName ?? user.username, avatar: user.avatarUrl ?? user.steamAvatarUrl } : null}
      />
    </>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
      {icon}
      <span className="sr-only lg:not-sr-only">{children}</span>
    </Link>
  );
}

/** Ícone da barra com contador (mensagens, moderação). */
function IconLink({ href, label, count, children }: { href: string; label: string; count: number; children: ReactNode }) {
  return (
    <Link href={href} className="relative rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label={label}>
      {children}
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-zinc-950">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
