"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Gamepad2, Medal, Newspaper, Users } from "lucide-react";

const ITEMS = [
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/games", label: "Jogos", icon: Gamepad2 },
  { href: "/explore", label: "Explorar", icon: Compass },
  { href: "/clubes", label: "Clubes", icon: Users },
  { href: "/ranking", label: "Ranking", icon: Medal },
];

/** Barra de navegação inferior no celular (como num app). */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-sky-400" : "text-zinc-400"}`}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
