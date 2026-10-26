"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, Pin, PinOff, Shield, ShieldOff, UserMinus } from "lucide-react";
import { removeMember, setMemberRole, togglePinPost, updateClubRules } from "../_actions/clubs";

/** Fixar / desafixar um post (dono e moderadores). */
export function PinPostButton({ postId, pinned }: { postId: string; pinned: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        title={pinned ? "Desafixar" : "Fixar no topo"}
        aria-label={pinned ? "Desafixar post" : "Fixar post no topo"}
        onClick={() =>
          startTransition(async () => {
            const r = await togglePinPost(postId);
            if (r.ok) router.refresh();
            else setMsg(r.message ?? null);
          })
        }
        className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-amber-300 disabled:opacity-50"
      >
        {pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
      </button>
      {msg && (
        <span role="alert" className="text-xs text-red-300">
          {msg}
        </span>
      )}
    </>
  );
}

/** Menu de cada membro na lista: promover/rebaixar (dono) e tirar do clube (dono e moderadores). */
export function MemberActions({
  clubId,
  userId,
  name,
  role,
  viewerRole,
}: {
  clubId: string;
  userId: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  viewerRole: "OWNER" | "ADMIN";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "OWNER" || (role === "ADMIN" && viewerRole !== "OWNER")) return null;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setOpen(false);
        router.refresh();
      } else if (r.message) alert(r.message);
    });

  return (
    <div className="relative hidden lg:block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Ações para ${name}`} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <MoreHorizontal className="size-3.5" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
          {viewerRole === "OWNER" && (
            <button
              type="button"
              onClick={() => run(() => setMemberRole(clubId, userId, role === "ADMIN" ? "MEMBER" : "ADMIN"))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              {role === "ADMIN" ? <ShieldOff className="size-4" aria-hidden /> : <Shield className="size-4 text-brand-400" aria-hidden />}
              {role === "ADMIN" ? "Tirar de moderador" : "Tornar moderador"}
            </button>
          )}
          <button
            type="button"
            onClick={() => confirm(`Tirar ${name} do clube?`) && run(() => removeMember(clubId, userId))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-zinc-800"
          >
            <UserMinus className="size-4" aria-hidden /> Tirar do clube
          </button>
        </div>
      )}
    </div>
  );
}

/** Regras do clube, com edição para dono e moderadores. */
export function ClubRules({ clubId, rules, canEdit }: { clubId: string; rules: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rules ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!rules && !canEdit) return null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <h2 className="mb-2 flex items-center text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Regras do clube
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="ml-auto rounded p-1 text-zinc-500 hover:text-zinc-200" aria-label="Editar regras">
            <Pencil className="size-3.5" aria-hidden />
          </button>
        )}
      </h2>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={6}
            placeholder={"1. Sem spoiler sem aviso\n2. Respeito sempre\n3. …"}
            aria-label="Regras do clube"
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await updateClubRules(clubId, text);
                  if (r.ok) {
                    setEditing(false);
                    router.refresh();
                  } else setMsg(r.message ?? "Não deu para salvar.");
                })
              }
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              Salvar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              Cancelar
            </button>
          </div>
          {msg && <p className="text-xs text-red-300">{msg}</p>}
        </div>
      ) : rules ? (
        <p className="whitespace-pre-line text-sm text-zinc-300">{rules}</p>
      ) : (
        <p className="text-sm text-zinc-500">Ainda sem regras. Escreva as combinações do clube.</p>
      )}
    </section>
  );
}
