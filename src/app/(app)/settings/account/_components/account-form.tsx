"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, Crop, ImageIcon, Loader2, Plus, Search, Upload, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { GameCover } from "@/components/game-cover";
import { steamHeroUrl } from "@/lib/steam/assets";
import { setFavorites, updateProfile, uploadProfileImage, type AccountResult } from "../_actions/account";
import { ImageCropper } from "./image-cropper";

export type GameOption = { id: string; title: string; coverUrl: string | null; steamAppId: number | null };

type Props = {
  username: string;
  profile: { displayName: string; bio: string; avatarUrl: string; bannerUrl: string };
  steamAvatarUrl: string | null;
  favorites: (GameOption | null)[]; // sempre 4 posições
  options: GameOption[];
  /** Upload de imagem disponível (precisa da chave secreta do Supabase no servidor) */
  canUpload: boolean;
};

export function AccountForm(props: Props) {
  return (
    <div className="space-y-6">
      <ProfileSection {...props} />
      <FavoritesSection initial={props.favorites} options={props.options} />
    </div>
  );
}

// =============================================================================
//  Perfil
// =============================================================================

function ProfileSection({ username, profile, steamAvatarUrl, favorites, options, canUpload }: Props) {
  const [form, setForm] = useState(profile);
  const [result, setResult] = useState<AccountResult | null>(null);
  const [bannerBroken, setBannerBroken] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Atalhos para a capa: arte larga dos favoritos (ou dos jogos mais jogados)
  const bannerPicks = [...favorites.filter((f): f is GameOption => Boolean(f)), ...options]
    .filter((g, i, all) => g.steamAppId && all.findIndex((x) => x.id === g.id) === i)
    .slice(0, 6);

  function onSave() {
    setResult(null);
    startTransition(async () => setResult(await updateProfile(form)));
  }

  const fieldError = (k: keyof typeof form) => (result && !result.ok && result.field === k ? result.message : null);
  const shownAvatar = form.avatarUrl.trim() || steamAvatarUrl;

  return (
    <Section title="Perfil" description="Como os outros jogadores veem você.">
      {/* Prévia */}
      <div className="relative mb-5 overflow-hidden rounded-xl border border-zinc-800">
        <div className="h-28 bg-gradient-to-br from-sky-900/60 to-violet-900/60">
          {form.bannerUrl && !bannerBroken && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.bannerUrl} alt="" className="size-full object-cover" onError={() => setBannerBroken(true)} />
          )}
        </div>
        <div className="flex items-end gap-3 px-4 pb-3">
          <div className="-mt-8 rounded-full ring-4 ring-zinc-950">
            <Avatar name={form.displayName || username} src={shownAvatar} size="md" />
          </div>
          <div className="min-w-0 pb-1">
            <p className="truncate font-semibold text-zinc-100">{form.displayName || username}</p>
            <p className="text-xs text-zinc-500">@{username}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Nome de exibição" error={fieldError("displayName")}>
          <input value={form.displayName} onChange={(e) => set("displayName")(e.target.value)} maxLength={60} placeholder={username} className={inputCls} />
        </Field>

        <Field label="Bio" hint={`${form.bio.length}/280`} error={fieldError("bio")}>
          <textarea value={form.bio} onChange={(e) => set("bio")(e.target.value)} maxLength={280} rows={3} placeholder="Caçador de platinas, fã de soulslike…" className={inputCls} />
        </Field>

        <Field
          label="Foto (link da imagem)"
          hint={steamAvatarUrl ? "Vazio = usa o avatar da Steam" : undefined}
          error={fieldError("avatarUrl")}
        >
          <div className="flex gap-2">
            <input value={form.avatarUrl} onChange={(e) => set("avatarUrl")(e.target.value)} placeholder="https://…" className={inputCls} />
            {canUpload && <UploadButton kind="avatar" current={shownAvatar || null} onUploaded={set("avatarUrl")} />}
          </div>
        </Field>

        <Field label="Capa de fundo (link da imagem)" error={fieldError("bannerUrl") ?? (bannerBroken && form.bannerUrl ? "Não conseguimos carregar essa imagem." : null)}>
          <div className="flex gap-2">
            <input
              value={form.bannerUrl}
              onChange={(e) => {
                setBannerBroken(false);
                set("bannerUrl")(e.target.value);
              }}
              placeholder="https://…"
              className={inputCls}
            />
            {canUpload && (
              <UploadButton
                kind="banner"
                current={form.bannerUrl && !bannerBroken ? form.bannerUrl : null}
                onUploaded={(url) => {
                  setBannerBroken(false);
                  set("bannerUrl")(url);
                }}
              />
            )}
          </div>
          {bannerPicks.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <ImageIcon className="size-3.5" aria-hidden /> Usar arte de:
              </span>
              {bannerPicks.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setBannerBroken(false);
                    set("bannerUrl")(steamHeroUrl(g.steamAppId!));
                  }}
                  className="max-w-40 truncate rounded-full border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {g.title}
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>

      <SaveRow pending={pending} onSave={onSave} result={result} />
    </Section>
  );
}

// =============================================================================
//  Top 4
// =============================================================================

function FavoritesSection({ initial, options }: { initial: (GameOption | null)[]; options: GameOption[] }) {
  const [slots, setSlots] = useState(initial);
  const [picking, setPicking] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AccountResult | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(slots.map((s) => s?.id));
    return options.filter((g) => !taken.has(g.id) && (!q || g.title.toLowerCase().includes(q))).slice(0, 40);
  }, [options, query, slots]);

  function choose(game: GameOption | null, index: number) {
    setSlots((s) => s.map((x, i) => (i === index ? game : x)));
    setPicking(null);
    setQuery("");
    setResult(null);
  }

  function onSave() {
    setResult(null);
    startTransition(async () => setResult(await setFavorites(slots.map((s) => s?.id ?? null))));
  }

  return (
    <Section title="Top 4" description="Seus jogos favoritos, em destaque no topo do perfil.">
      <div className="grid grid-cols-4 gap-3">
        {slots.map((game, i) => (
          <div key={i} className="relative">
            <button
              type="button"
              onClick={() => setPicking(picking === i ? null : i)}
              className={`block w-full rounded-lg ${picking === i ? "ring-2 ring-sky-500" : ""}`}
              aria-label={game ? `Trocar ${game.title}` : `Escolher jogo para a posição ${i + 1}`}
            >
              {game ? (
                <GameCover title={game.title} coverUrl={game.coverUrl} steamAppId={game.steamAppId} />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500">
                  <Plus className="size-6" aria-hidden />
                </div>
              )}
            </button>
            {game && (
              <button
                type="button"
                onClick={() => choose(null, i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-800 p-1 text-zinc-300 ring-1 ring-zinc-600 hover:bg-red-900"
                aria-label={`Remover ${game.title}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      {picking !== null && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 focus-within:border-sky-500">
            <Search className="size-4 text-zinc-500" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Posição ${picking + 1}: buscar nos seus jogos…`}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          {options.length === 0 ? (
            <p className="p-2 text-sm text-zinc-500">
              Você ainda não tem jogos. Vincule a Steam ou registre jogos pela busca em Jogos.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {filtered.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => choose(g, picking)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <span className="w-8 shrink-0">
                      <GameCover title={g.title} coverUrl={g.coverUrl} steamAppId={g.steamAppId} />
                    </span>
                    <span className="truncate">{g.title}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="p-2 text-sm text-zinc-500">Nenhum jogo encontrado.</li>}
            </ul>
          )}
        </div>
      )}

      <SaveRow pending={pending} onSave={onSave} result={result} />
    </Section>
  );
}

// =============================================================================
//  Upload
// =============================================================================

/** Formato do recorte e tamanho final de cada imagem. */
const CROP = {
  avatar: { aspect: 1, outputWidth: 512, round: true, title: "Recortar foto de perfil" },
  banner: { aspect: 4, outputWidth: 1920, round: false, title: "Recortar capa" },
} as const;

/**
 * Escolhe a imagem, abre o recorte e envia o resultado (JPEG: leve e aceito pelos
 * cards de compartilhamento, que não desenham WebP). A imagem já fica salva no perfil.
 */
function UploadButton({
  kind,
  current,
  onUploaded,
}: {
  kind: "avatar" | "banner";
  /** Imagem atual (link enviado, avatar da Steam ou arte de jogo): habilita "Ajustar" */
  current: string | null;
  onUploaded: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(picked: File | undefined) {
    if (input.current) input.current.value = "";
    if (!picked) return;
    if (!picked.type.startsWith("image/")) return setError("Escolha um arquivo de imagem.");
    setError(null);
    setFile(picked);
  }

  async function upload(blob: Blob) {
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", new File([blob], `${kind}.jpg`, { type: "image/jpeg" }));
    const res = await uploadProfileImage(data);
    if (res.ok) {
      onUploaded(res.url);
      setFile(null);
    } else {
      setError(res.message);
      setFile(null);
    }
  }

  return (
    <div className="shrink-0">
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} tabIndex={-1} />
      <div className="flex h-full gap-2">
        {current && (
          <button
            type="button"
            onClick={() => setFile(current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
            title="Recortar a imagem atual"
          >
            <Crop className="size-4" aria-hidden />
            Ajustar
          </button>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
        >
          <Upload className="size-4" aria-hidden />
          Enviar
        </button>
      </div>
      {error && <span className="mt-1 block text-xs text-red-300">{error}</span>}
      {file && <ImageCropper source={file} {...CROP[kind]} onCancel={() => setFile(null)} onConfirm={upload} />}
    </div>
  );
}

// =============================================================================
//  UI
// =============================================================================

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30";

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <p className="mb-5 text-sm text-zinc-400">{description}</p>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-sm font-medium text-zinc-200">
        {label}
        {hint && <span className="text-xs font-normal text-zinc-500">{hint}</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-red-300">{error}</span>}
    </label>
  );
}

function SaveRow({ pending, onSave, result }: { pending: boolean; onSave: () => void; result: AccountResult | null }) {
  return (
    <div className="mt-5 flex items-center justify-end gap-3">
      {result?.ok && (
        <span className="flex items-center gap-1 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden /> Salvo
        </span>
      )}
      {/* Erros de campo aparecem embaixo do campo; aqui só os gerais e os do Top 4 */}
      {result && !result.ok && (!result.field || result.field === "favorites") && <span className="text-sm text-red-300">{result.message}</span>}
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Salvar
      </button>
    </div>
  );
}
