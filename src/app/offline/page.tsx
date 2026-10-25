import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Sem conexão" };
// Página estática: o service worker guarda esta versão para mostrar sem internet
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <WifiOff className="size-10 text-zinc-500" aria-hidden />
      <h1 className="text-xl font-bold text-zinc-50">Sem conexão</h1>
      <p className="max-w-xs text-sm text-zinc-400">Parece que você está offline. Assim que a internet voltar, é só tentar de novo.</p>
      {/* Link comum: força uma nova navegação (o SW tenta a rede de novo) */}
      <a href="/feed" className="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
        Tentar de novo
      </a>
    </main>
  );
}
