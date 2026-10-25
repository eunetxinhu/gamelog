"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, BellOff, Check, Copy, Loader2, Lock } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { removePushSubscription, savePushSubscription, unblockUser, updatePrivacy } from "@/app/(app)/_actions/moderation";

type DmPolicy = "EVERYONE" | "FOLLOWING" | "NOBODY";

// =============================================================================
//  Notificações push
// =============================================================================

/** Chave pública VAPID (base64url) → bytes, como o PushManager pede. */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") return setStatus("denied");
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    });
  }, [publicKey]);

  function enable() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
        const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const res = await savePushSubscription(json, navigator.userAgent);
        setStatus(res.ok ? "on" : "off");
      } catch {
        setStatus("off");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-zinc-100">Notificações no celular e no computador</p>
        <p className="text-sm text-zinc-400">
          {status === "unsupported" && "Este navegador não suporta notificações push. No iPhone, instale o GameLog na Tela de Início primeiro."}
          {status === "denied" && "As notificações estão bloqueadas nas configurações do navegador para este site."}
          {(status === "off" || status === "loading") && "Platinas de amigos, GGs, comentários, mensagens e promoções, mesmo com o site fechado."}
          {status === "on" && "Ativadas neste aparelho."}
        </p>
      </div>
      {status === "on" ? (
        <button type="button" onClick={disable} disabled={pending} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellOff className="size-4" aria-hidden />} Desativar
        </button>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={pending || status === "unsupported" || status === "denied" || status === "loading"}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Bell className="size-4" aria-hidden />} Ativar
        </button>
      )}
    </div>
  );
}

// =============================================================================
//  Privacidade
// =============================================================================

export function PrivacySettings({ initial }: { initial: { isPrivate: boolean; dmPolicy: DmPolicy } }) {
  const [isPrivate, setIsPrivate] = useState(initial.isPrivate);
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>(initial.dmPolicy);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = isPrivate !== initial.isPrivate || dmPolicy !== initial.dmPolicy;

  function save() {
    setSaved(false);
    startTransition(async () => {
      if ((await updatePrivacy({ isPrivate, dmPolicy })).ok) setSaved(true);
    });
  }

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="flex items-center gap-1.5 font-medium text-zinc-100">
            <Lock className="size-4 text-zinc-400" aria-hidden /> Perfil privado
          </span>
          <span className="block text-sm text-zinc-400">
            Só seguidores aprovados por você veem sua atividade, biblioteca e listas. Novos seguidores viram pedidos.
          </span>
        </span>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-1 size-5 shrink-0 accent-sky-500" />
      </label>

      <fieldset>
        <legend className="font-medium text-zinc-100">Quem pode me mandar mensagem</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["EVERYONE", "Todos"],
              ["FOLLOWING", "Só quem eu sigo"],
              ["NOBODY", "Ninguém"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="dm" value={value} checked={dmPolicy === value} onChange={() => setDmPolicy(value)} className="peer sr-only" />
              <span className="inline-block rounded-full px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-zinc-700 transition peer-checked:bg-sky-600 peer-checked:text-white peer-checked:ring-sky-500 peer-focus-visible:ring-2">
                {label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">Quem já recebeu mensagem sua sempre pode responder.</p>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-sm text-emerald-300">
            <Check className="size-4" aria-hidden /> Salvo
          </span>
        )}
        <button type="button" onClick={save} disabled={!dirty || pending} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Salvar
        </button>
      </div>
    </div>
  );
}

// =============================================================================
//  Convite e bloqueados
// =============================================================================

export function InviteLink({ url, invites }: { url: string; invites: number }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copie o link:", url);
    }
  }
  return (
    <div>
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Seu link de convite" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300" />
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {invites} {invites === 1 ? "amigo entrou" : "amigos entraram"} pelo seu link. Com 3, você ganha o selo 📨 Recrutador.
      </p>
    </div>
  );
}

export function BlockedList({ users }: { users: { id: string; username: string; displayName: string | null; avatar: string | null }[] }) {
  const [list, setList] = useState(users);
  const [pending, startTransition] = useTransition();
  if (list.length === 0) return <p className="text-sm text-zinc-500">Você não bloqueou ninguém.</p>;
  return (
    <ul className="space-y-2">
      {list.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <Avatar name={u.displayName ?? u.username} src={u.avatar} size="sm" />
          <Link href={`/u/${u.username}`} className="min-w-0 flex-1 truncate text-sm text-zinc-200 hover:underline">
            {u.displayName ?? u.username} <span className="text-zinc-500">@{u.username}</span>
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if ((await unblockUser(u.id)).ok) setList((l) => l.filter((x) => x.id !== u.id));
              })
            }
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            Desbloquear
          </button>
        </li>
      ))}
    </ul>
  );
}
