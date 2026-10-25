import { ExternalLink, Megaphone } from "lucide-react";
import { getGameNews } from "@/lib/steam/api";
import { relativeTime } from "@/lib/format";

/** Notícias e atualizações do jogo (anúncios oficiais da Steam primeiro). Carregado em <Suspense>. */
export async function GameNews({ appId }: { appId: number }) {
  const news = await getGameNews(appId, 4);
  if (news.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-50">
        <Megaphone className="size-4 text-sky-400" aria-hidden /> Notícias e atualizações
      </h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {news.map((n) => (
          <li key={n.url}>
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block h-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-600"
            >
              <p className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                <span className={n.feed === "Anúncio oficial" ? "font-semibold text-sky-400" : ""}>{n.feed}</span>· {relativeTime(n.date)}
              </p>
              <p className="flex items-start gap-1.5 font-semibold text-zinc-100 group-hover:text-white">
                <span className="line-clamp-2">{n.title}</span>
                <ExternalLink className="mt-1 size-3.5 shrink-0 opacity-50" aria-hidden />
              </p>
              {n.excerpt && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{n.excerpt}</p>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
