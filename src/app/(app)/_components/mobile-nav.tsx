"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Gamepad2, LogIn, Medal, Newspaper, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";

type NavUser = { username: string; name: string; avatar: string | null };

/** Telas em que a barra some para dar espaço (ex.: conversa aberta, com o campo de digitar no rodapé). */
const HIDE_ON = [/^\/mensagens\/[^/]+$/];

/** Barra de navegação inferior no celular (como num app). */
export function MobileNav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  if (HIDE_ON.some((re) => re.test(pathname))) return null;

  const items = user
    ? [
        { href: "/feed", label: "Feed", icon: Newspaper },
        { href: "/games", label: "Jogos", icon: Gamepad2 },
        { href: "/explore", label: "Explorar", icon: Compass },
        { href: "/clubes", label: "Clubes", icon: Users },
      ]
    : [
        { href: "/games", label: "Jogos", icon: Gamepad2 },
        { href: "/explore", label: "Explorar", icon: Compass },
        { href: "/ranking", label: "Ranking", icon: Medal },
        { href: "/clubes", label: "Clubes", icon: Users },
      ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const profileHref = user ? `/u/${user.username}` : "/login";

  return (
    <>
      {/* Espaço para o conteúdo não ficar atrás da barra */}
      <div aria-hidden className="h-[calc(4rem_+_env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {items.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <NavItem href={href} label={label} active={isActive(href)}>
                <Icon className="size-6" strokeWidth={isActive(href) ? 2.4 : 1.8} aria-hidden />
              </NavItem>
            </li>
          ))}
          <li>
            <NavItem href={profileHref} label={user ? "Perfil" : "Entrar"} active={isActive(profileHref)}>
              {user ? (
                <span className={`rounded-full ring-2 ${isActive(profileHref) ? "ring-brand-400" : "ring-transparent"}`}>
                  <Avatar name={user.name} src={user.avatar} size="xs" />
                </span>
              ) : (
                <LogIn className="size-6" strokeWidth={1.8} aria-hidden />
              )}
            </NavItem>
          </li>
        </ul>
      </nav>
    </>
  );
}

function NavItem({ href, label, active, children }: { href: string; label: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition active:scale-95 ${
        active ? "text-brand-400" : "text-zinc-400"
      }`}
    >
      {children}
      {label}
    </Link>
  );
}
