"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/account", label: "Perfil" },
  { href: "/settings/profile", label: "Contas vinculadas", short: "Contas" },
  { href: "/settings/privacy", label: "Privacidade" },
  { href: "/settings/dados", label: "Seus dados", short: "Dados" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1" aria-label="Configurações">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
              active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.short ? (
              <>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
          </Link>
        );
      })}
    </nav>
  );
}
