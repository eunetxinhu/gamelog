import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Compass, Gamepad2, LogOut, Medal, Newspaper, Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { Avatar } from "@/components/avatar";
import { signOut } from "../(auth)/_actions/auth";
import { SteamAutoSync } from "./_components/steam-auto-sync";

/** Sincronização automática só quando a última tem mais que isso. */
const AUTO_SYNC_AFTER_MS = 30 * 60 * 1000;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const needsSync =
    Boolean(user?.steamId) &&
    (!user?.steamLastSyncAt || Date.now() - user.steamLastSyncAt.getTime() > AUTO_SYNC_AFTER_MS);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-1 sm:gap-4">
            <Link href={user ? "/feed" : "/"} className="mr-2 text-lg font-bold text-zinc-50">
              GameLog
            </Link>
            <NavLink href="/feed" icon={<Newspaper className="size-4" aria-hidden />}>
              Feed
            </NavLink>
            <NavLink href="/games" icon={<Gamepad2 className="size-4" aria-hidden />}>
              Jogos
            </NavLink>
            <NavLink href="/explore" icon={<Compass className="size-4" aria-hidden />}>
              Explorar
            </NavLink>
            <NavLink href="/ranking" icon={<Medal className="size-4" aria-hidden />}>
              Ranking
            </NavLink>
          </div>

          {user ? (
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <Link href={`/u/${user.username}`} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-800" title="Meu perfil">
                <Avatar name={user.displayName ?? user.username} src={user.avatarUrl ?? user.steamAvatarUrl} size="sm" />
                <span className="hidden truncate text-sm text-zinc-300 sm:inline">@{user.username}</span>
              </Link>
              <Link
                href="/notifications"
                className="relative rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label={unread ? `Notificações (${unread} novas)` : "Notificações"}
              >
                <Bell className="size-4" aria-hidden />
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/settings/account" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Configurações">
                <Settings className="size-4" aria-hidden />
              </Link>
              <form action={signOut}>
                <button type="submit" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Sair">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            </div>
          ) : (
            <Link href="/login" className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
              Entrar
            </Link>
          )}
        </nav>
      </header>
      {needsSync && <SteamAutoSync />}
      {children}
    </>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}
