import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = { title: "Ilha não encontrada" };

/** 404 com o tema do site: a página "não está no mapa". */
export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#0c0101] px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/fundo-2.jpg" alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/85" aria-hidden />

      <section className="relative w-full max-w-md text-center">
        <Link href="/" aria-label="Início" className="mx-auto mb-8 block w-fit">
          <BrandLogo className="h-9" />
        </Link>
        <div className="mx-auto grid size-24 place-items-center rounded-full border border-brand-500/40 bg-black/50 shadow-[0_0_40px_-8px_rgba(239,51,64,0.6)]">
          <Compass className="size-12 animate-[spin_6s_linear_infinite] text-brand-400 motion-reduce:animate-none" aria-hidden />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.3em] text-brand-400">Erro 404</p>
        <h1 className="mt-2 text-3xl font-extrabold text-zinc-50 sm:text-4xl">Essa ilha não está no mapa</h1>
        <p className="mt-3 text-sm text-zinc-300">
          A página que você procura afundou, mudou de rota ou nunca existiu. Até a bússola ficou perdida.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/feed" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500">
            Voltar ao feed
          </Link>
          <Link href="/games" className="rounded-lg border border-zinc-700 bg-black/40 px-5 py-2.5 text-sm text-zinc-200 transition hover:bg-zinc-800">
            Explorar jogos
          </Link>
        </div>
      </section>
    </main>
  );
}
