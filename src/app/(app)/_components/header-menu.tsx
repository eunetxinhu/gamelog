"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, ListOrdered, LogOut, Medal, Menu, ScrollText, Settings, ShieldCheck, UserRound } from "lucide-react";
import { signOut } from "../../(auth)/_actions/auth";

/** Menu do topo no celular: o que não cabe na barra inferior. */
export function HeaderMenu({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Fecha ao navegar (ajuste de estado durante o render, sem efeito) …
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setOpen(false);
  }
  // … e ao tocar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const item = "flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-zinc-200 active:bg-zinc-800";
  return (
    <div ref={box} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Menu"
        className="rounded-lg p-2 text-zinc-400 active:bg-zinc-800"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-60 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl">
          <Link href={`/u/${username}`} className={item}>
            <UserRound className="size-5 text-zinc-400" aria-hidden /> Meu perfil
          </Link>
          <Link href="/listas" className={item}>
            <ListOrdered className="size-5 text-zinc-400" aria-hidden /> Listas
          </Link>
          <Link href="/ranking" className={item}>
            <Medal className="size-5 text-zinc-400" aria-hidden /> Ranking
          </Link>
          <Link href="/lancamentos" className={item}>
            <CalendarClock className="size-5 text-zinc-400" aria-hidden /> Lançamentos
          </Link>
          <Link href="/settings/account" className={item}>
            <Settings className="size-5 text-zinc-400" aria-hidden /> Configurações
          </Link>
          <Link href="/settings/privacy" className={item}>
            <ShieldCheck className="size-5 text-zinc-400" aria-hidden /> Privacidade e convites
          </Link>
          <Link href="/regras" className={item}>
            <ScrollText className="size-5 text-zinc-400" aria-hidden /> Regras da comunidade
          </Link>
          <form action={signOut} className="border-t border-zinc-800">
            <button type="submit" className={`${item} text-red-300`}>
              <LogOut className="size-5" aria-hidden /> Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
