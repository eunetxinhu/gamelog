"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, LogOut, Plus, Send, Trash2 } from "lucide-react";
import { ImageAttach } from "@/components/image-attach";
import { createClub, deleteClub, deleteClubPost, postToClub, toggleMembership } from "../_actions/clubs";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30";

/** Criar clube. */
export function CreateClubForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
        <Plus className="size-4" aria-hidden /> Criar clube
      </button>
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createClub({ name, description, imageUrl: image });
      if (!res.ok) return setError(res.message);
      router.push(`/clubes/${res.slug}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="font-semibold text-zinc-50">Novo clube</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nome (ex.: Caçadores de platina)" className={inputCls} required />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="Sobre o que é o clube?" className={inputCls} />
      <ImageAttach kind="club" value={image} onChange={setImage} />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Criar
        </button>
      </div>
    </form>
  );
}

/** Entrar / sair do clube. */
export function MembershipButton({ clubId, member: initial, loggedIn }: { clubId: string; member: boolean; loggedIn: boolean }) {
  const router = useRouter();
  const [member, setMember] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    startTransition(async () => {
      const res = await toggleMembership(clubId);
      if (res.ok && res.member !== undefined) {
        setMember(res.member);
        router.refresh();
      } else if (res.message) alert(res.message);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
        member ? "border border-zinc-700 text-zinc-200 hover:bg-zinc-800" : "bg-sky-600 text-white hover:bg-sky-500"
      }`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : member ? <LogOut className="size-4" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
      {member ? "Sair do clube" : "Entrar no clube"}
    </button>
  );
}

/** Publicar no mural do clube. */
export function ClubComposer({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await postToClub(clubId, body, image);
      if (!res.ok) return setError(res.message);
      setBody("");
      setImage(null);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Compartilhe com o clube… (@usuario para mencionar)" aria-label="Nova publicação no clube" className={inputCls} />
      <div className="flex items-start justify-between gap-2">
        <ImageAttach kind="club" value={image} onChange={setImage} />
        <button type="submit" disabled={pending || (!body.trim() && !image)} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Publicar
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}

export function DeleteClubPostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Apagar esta publicação?")) return;
        startTransition(async () => {
          if ((await deleteClubPost(postId)).ok) router.refresh();
        });
      }}
      className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
      aria-label="Apagar publicação"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

export function DeleteClubButton({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Apagar o clube e todas as publicações? Não dá para desfazer.")) return;
        startTransition(async () => {
          if ((await deleteClub(clubId)).ok) router.push("/clubes");
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
    >
      <Trash2 className="size-4" aria-hidden /> Apagar clube
    </button>
  );
}
