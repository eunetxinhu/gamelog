"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Gamepad2, ImagePlus, Loader2, RefreshCw, Search, X } from "lucide-react";
import { uploadMedia } from "@/app/(app)/_actions/media";
import { imageVariants } from "@/lib/image-shrink";
import { takeSharedFiles } from "@/lib/share-inbox";
import { CAPTION_MAX, MAX_PHOTOS } from "@/lib/photo-post";
import { GameCover } from "@/components/game-cover";
import { createPhotoPost, discardUpload, searchGamesForPost, type GameOption } from "../_actions/photo-post";

type Photo = { key: string; preview: string; url: string | null; status: "uploading" | "done" | "error"; error?: string };

type Props = {
  /** Atalhos: jogos que a pessoa está jogando / registrou por último */
  quickGames: GameOption[];
  /** Abre já expandido (botão flutuante do celular manda ?postar=1) */
  startOpen?: boolean;
  /** Veio do "Compartilhar" do celular: quantas fotos e o texto que veio junto */
  shared?: { count: number; text: string | null } | null;
};

/**
 * "Compartilhar fotos" no topo do feed. Fotos do aparelho (galeria ou câmera),
 * sempre associadas a um jogo: sem escolher o jogo, não publica.
 */
export function PhotoComposer({ quickGames, startOpen = false, shared = null }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [game, setGame] = useState<GameOption | null>(null);
  const [caption, setCaption] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [posting, startPosting] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  const captionId = useId();

  // Botão flutuante do celular (?postar=1): abre (ajuste durante o render) e rola até aqui
  const [prevStartOpen, setPrevStartOpen] = useState(startOpen);
  if (startOpen !== prevStartOpen) {
    setPrevStartOpen(startOpen);
    if (startOpen) setOpen(true);
  }
  useEffect(() => {
    if (startOpen) section.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [startOpen]);

  // Fotos compartilhadas da galeria: entram como se tivessem sido escolhidas aqui
  const receivedShare = useRef(false);
  useEffect(() => {
    if (!shared || shared.count === 0 || receivedShare.current) return;
    receivedShare.current = true;
    takeSharedFiles()
      .then((files) => {
        if (shared.text) setCaption((c) => c || shared.text!.slice(0, CAPTION_MAX));
        if (files.length) void onPick(files);
        else setMessage({ tone: "error", text: "Não conseguimos receber as fotos compartilhadas. Escolha de novo por aqui." });
      })
      .catch(() => setMessage({ tone: "error", text: "Não conseguimos receber as fotos compartilhadas. Escolha de novo por aqui." }));
    // onPick só depende de estado que ainda está vazio neste momento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  // Libera as prévias da memória ao sair
  const previews = useRef(new Set<string>());
  useEffect(() => () => previews.current.forEach((p) => URL.revokeObjectURL(p)), []);

  const uploading = photos.some((p) => p.status === "uploading");
  const ready = photos.filter((p) => p.status === "done" && p.url);
  const canPost = Boolean(game) && ready.length > 0 && !uploading && !posting;

  function update(key: string, patch: Partial<Photo>) {
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  async function upload(photo: Photo, file: File) {
    try {
      const { full, thumb } = await imageVariants(file);
      const data = new FormData();
      data.set("kind", "post");
      data.set("file", full);
      data.set("thumb", thumb);
      const res = await uploadMedia(data);
      if (res.ok) update(photo.key, { url: res.url, status: "done" });
      else update(photo.key, { status: "error", error: res.message });
    } catch {
      update(photo.key, { status: "error", error: "Não conseguimos ler essa imagem." });
    }
  }

  async function onPick(list: FileList | File[] | null) {
    // Copia antes de limpar o input: FileList é "ao vivo" e esvazia junto
    const files = list ? [...list] : [];
    if (fileInput.current) fileInput.current.value = "";
    if (!files.length) return;
    setMessage(null);
    const room = MAX_PHOTOS - photos.length;
    const chosen = files.filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (files.length > room) setMessage({ tone: "error", text: `No máximo ${MAX_PHOTOS} fotos por publicação.` });
    const added = chosen.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { photo: { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, preview, url: null, status: "uploading" as const }, file };
    });
    setPhotos((list) => [...list, ...added.map((a) => a.photo)]);
    // Uma de cada vez: no 4G é mais estável do que várias em paralelo
    for (const { photo, file } of added) await upload(photo, file);
  }

  function removePhoto(photo: Photo) {
    setPhotos((list) => list.filter((p) => p.key !== photo.key));
    URL.revokeObjectURL(photo.preview);
    previews.current.delete(photo.preview);
    if (photo.url) void discardUpload(photo.url);
  }

  function reset() {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    previews.current.clear();
    setPhotos([]);
    setGame(null);
    setCaption("");
    setSpoiler(false);
  }

  /** Tira o ?postar=1 da URL (senão o botão flutuante não abre de novo). */
  function clearOpenParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("postar") && !url.searchParams.has("compartilhado")) return;
    for (const k of ["postar", "compartilhado", "texto"]) url.searchParams.delete(k);
    url.hash = "";
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }

  function cancel() {
    photos.forEach((p) => p.url && void discardUpload(p.url));
    reset();
    setMessage(null);
    setOpen(false);
    clearOpenParam();
  }

  function onPost() {
    if (!game) return setMessage({ tone: "error", text: "Escolha de qual jogo são as fotos." });
    setMessage(null);
    startPosting(async () => {
      const res = await createPhotoPost({
        gameSlug: game.slug,
        images: ready.map((p) => p.url!),
        caption,
        containsSpoiler: spoiler,
      });
      if (!res.ok) return setMessage({ tone: "error", text: res.message });
      reset();
      setOpen(false);
      setMessage({ tone: "ok", text: "Publicado no feed!" });
      clearOpenParam();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <section ref={section} id="postar" className="mb-4 scroll-mt-20">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage(null);
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-600/20 text-sky-300">
            <Camera className="size-5" aria-hidden />
          </span>
          Compartilhe fotos de um jogo…
        </button>
        {message?.tone === "ok" && (
          <p role="status" className="mt-2 flex items-center gap-1.5 text-sm text-emerald-300">
            <CheckCircle2 className="size-4" aria-hidden /> {message.text}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      ref={section}
      id="postar"
      aria-label="Compartilhar fotos"
      className="mb-4 scroll-mt-20 space-y-4 rounded-2xl border border-sky-500/30 bg-zinc-900/80 p-4 sm:p-5"
    >
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-zinc-50">
          <Camera className="size-5 text-sky-400" aria-hidden /> Compartilhar fotos
        </h2>
        <button type="button" onClick={cancel} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Cancelar">
          <X className="size-5" aria-hidden />
        </button>
      </header>

      {/* ---- 1. Fotos ------------------------------------------------------- */}
      <div>
        <div className="grid grid-cols-4 gap-2">
          {photos.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className={`size-full object-cover ${p.status === "done" ? "" : "opacity-50"}`} />
              {p.status === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-white" aria-label="Enviando" />
                </span>
              )}
              {p.status === "error" && (
                <span className="absolute inset-x-0 bottom-0 bg-red-950/90 p-1 text-center text-[10px] leading-tight text-red-100">{p.error}</span>
              )}
              <button
                type="button"
                onClick={() => removePhoto(p)}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                aria-label="Remover foto"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-600 text-xs text-zinc-400 transition hover:border-sky-500 hover:text-sky-300"
            >
              <ImagePlus className="size-6" aria-hidden />
              {photos.length === 0 ? "Escolher fotos" : "Mais"}
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Escolher fotos do aparelho"
          onChange={(e) => onPick(e.target.files)}
        />
        <p className="mt-1.5 text-xs text-zinc-500">Até {MAX_PHOTOS} fotos da galeria ou da câmera. Elas são reduzidas antes de enviar.</p>
      </div>

      {/* ---- 2. Jogo (obrigatório) ----------------------------------------- */}
      <GamePicker value={game} onChange={setGame} quickGames={quickGames} />

      {/* ---- 3. Legenda ------------------------------------------------------ */}
      <div className="space-y-2">
        <label htmlFor={captionId} className="text-sm text-zinc-400">
          Legenda (opcional)
        </label>
        <textarea
          id={captionId}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          maxLength={CAPTION_MAX}
          placeholder="Conte o que está rolando. Use @usuario para marcar alguém"
          className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        />
        {caption.trim() && (
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} className="accent-amber-500" />
            Contém spoiler
          </label>
        )}
      </div>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!game && ready.length > 0 && <span className="mr-auto text-xs text-amber-300">Escolha o jogo para publicar</span>}
        <button
          type="button"
          onClick={onPost}
          disabled={!canPost}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-2"
        >
          {posting || uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {posting ? "Publicando…" : uploading ? "Enviando fotos…" : "Publicar"}
        </button>
      </div>
    </section>
  );
}

// =============================================================================
//  Seletor de jogo
// =============================================================================

function GamePicker({ value, onChange, quickGames }: { value: GameOption | null; onChange: (g: GameOption | null) => void; quickGames: GameOption[] }) {
  const [query, setQuery] = useState("");
  // Resultado guardado junto com a busca que o gerou: "buscando" e a lista saem disso
  const [found, setFound] = useState<{ q: string; items: GameOption[] } | null>(null);
  const inputId = useId();
  const q = query.trim();
  const active = q.length >= 2;
  const results = active && found?.q === q ? found.items : [];
  const searching = active && found?.q !== q;

  // Busca com espera de 350 ms depois de parar de digitar
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const t = setTimeout(async () => {
      const items = await searchGamesForPost(q).catch(() => []);
      if (alive) setFound({ q, items });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, active]);

  if (value) {
    return (
      <div>
        <p className="mb-1.5 text-sm text-zinc-400">Jogo</p>
        <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-2 pr-3">
          <span className="w-10 shrink-0">
            <GameCover title={value.title} coverUrl={value.coverUrl} steamAppId={value.steamAppId} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">{value.title}</span>
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline">
            <RefreshCw className="size-3" aria-hidden /> Trocar
          </button>
        </div>
      </div>
    );
  }

  const list = query.trim().length >= 2 ? results : quickGames;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 flex items-center gap-1.5 text-sm text-zinc-400">
        <Gamepad2 className="size-4" aria-hidden /> De qual jogo? <span className="text-amber-300">(obrigatório)</span>
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/30">
        {searching ? <Loader2 className="size-4 shrink-0 animate-spin text-zinc-500" aria-hidden /> : <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />}
        <input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jogo"
          autoComplete="off"
          type="search"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>

      {list.length > 0 && (
        <>
          {query.trim().length < 2 && <p className="mt-2 text-xs text-zinc-500">Jogando e registrados recentemente</p>}
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto" aria-label="Jogos">
            {list.map((g) => (
              <li key={g.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(g);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-zinc-800 focus-visible:bg-zinc-800 focus-visible:outline-none"
                >
                  <span className="w-8 shrink-0">
                    <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{g.title}</span>
                  {g.year && <span className="shrink-0 text-xs text-zinc-500">{g.year}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="mt-2 text-xs text-zinc-500">Nenhum jogo encontrado. Tente outro nome.</p>
      )}
    </div>
  );
}
