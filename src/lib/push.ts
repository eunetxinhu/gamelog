import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export type PushPayload = { title: string; body: string; url: string; tag?: string; icon?: string };

let configured: boolean | null = null;

/** Push só funciona com as chaves VAPID configuradas (ver .env.example). */
export function pushEnabled() {
  if (configured === null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    configured = Boolean(pub && priv);
    if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://gamelog.app", pub!, priv!);
  }
  return configured;
}

/**
 * Manda o mesmo push para todos os aparelhos inscritos de cada usuário.
 * Inscrições que o navegador já cancelou (404/410) são apagadas.
 */
export async function sendPush(userIds: string[], payload: PushPayload) {
  if (!pushEnabled() || userIds.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else console.error("[push] falhou", status ?? err);
      }
    }),
  );
  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
}
