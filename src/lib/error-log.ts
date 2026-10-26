import "server-only";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push";
import { errorFingerprint, normalizePath } from "@/lib/error-fingerprint";

/** Um push por erro (agrupado) a cada hora, no máximo. */
const NOTIFY_EVERY_MS = 60 * 60 * 1000;

export type ErrorInput = { kind: "server" | "client"; message: string; stack?: string | null; path?: string | null; method?: string | null };

/**
 * Guarda o erro (agrupado pela "impressão digital") e avisa os administradores por push.
 * Um erro resolvido que volta a acontecer é reaberto. Nunca lança: registrar erro não
 * pode virar outro erro.
 */
export async function recordError(input: ErrorInput): Promise<void> {
  try {
    const message = (input.message || "Erro sem mensagem").slice(0, 500);
    const fingerprint = errorFingerprint(input.kind, message, input.path);
    const now = new Date();
    const row = await prisma.errorEvent.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        kind: input.kind,
        message,
        stack: input.stack?.slice(0, 8000) ?? null,
        path: normalizePath(input.path),
        method: input.method?.slice(0, 10) ?? null,
      },
      update: { count: { increment: 1 }, lastSeenAt: now, resolvedAt: null, stack: input.stack?.slice(0, 8000) ?? undefined },
      select: { id: true, count: true, notifiedAt: true },
    });

    if (row.notifiedAt && now.getTime() - row.notifiedAt.getTime() < NOTIFY_EVERY_MS) return;
    // Marca antes de mandar: dois erros simultâneos não disparam dois pushes
    const claimed = await prisma.errorEvent.updateMany({
      where: { id: row.id, OR: [{ notifiedAt: null }, { notifiedAt: { lt: new Date(now.getTime() - NOTIFY_EVERY_MS) } }] },
      data: { notifiedAt: now },
    });
    if (claimed.count === 0) return;
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    await sendPush(
      admins.map((a) => a.id),
      {
        title: `⚠️ Erro no site${row.count > 1 ? ` (${row.count}×)` : ""}`,
        body: `${normalizePath(input.path) ?? ""} ${message}`.trim().slice(0, 140),
        url: "/moderacao/erros",
        tag: `erro-${fingerprint.slice(0, 12)}`,
      },
    );
  } catch (err) {
    console.error("[erros] não deu para registrar", err);
  }
}
