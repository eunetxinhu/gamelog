// Preferências de notificação por tipo (sem banco: testável e usado no client).
import type { NotificationType } from "@/generated/prisma/enums";

/**
 * Para cada categoria, a pessoa escolhe:
 *  - "off":  não avisa (não cria a notificação nem manda push)
 *  - "app":  só no sino do site
 *  - "push": no sino e no celular/computador (padrão)
 */
export type NotifyLevel = "off" | "app" | "push";

export const NOTIFY_LEVELS: { value: NotifyLevel; label: string }[] = [
  { value: "off", label: "Desligado" },
  { value: "app", label: "Só no site" },
  { value: "push", label: "Site e celular" },
];

export const NOTIFICATION_CATEGORIES = [
  { id: "reactions", label: "Curtidas e GGs", types: ["LIKE", "GG", "LIST_LIKE"] },
  { id: "comments", label: "Comentários", types: ["COMMENT", "LIST_COMMENT"] },
  { id: "mentions", label: "Menções (@você)", types: ["MENTION"] },
  { id: "follows", label: "Novos seguidores e pedidos para seguir", types: ["FOLLOW", "FOLLOW_REQUEST", "INVITE_JOINED"] },
  { id: "messages", label: "Mensagens diretas", types: ["MESSAGE"], hint: "As mensagens sempre aparecem em Mensagens; isto controla o aviso." },
  { id: "platinums", label: "Platinas de quem você segue", types: ["PLATINUM"] },
  { id: "deals", label: "Promoções da wishlist", types: ["DEAL"] },
  { id: "releases", label: "Lançamentos da wishlist", types: ["RELEASE"] },
  { id: "weekly", label: "Resumo da semana", types: ["WEEKLY"] },
] as const satisfies readonly { id: string; label: string; types: readonly NotificationType[]; hint?: string }[];

export type CategoryId = (typeof NOTIFICATION_CATEGORIES)[number]["id"];
export type NotificationPrefs = Record<CategoryId, NotifyLevel>;

const DEFAULT_LEVEL: NotifyLevel = "push";
const LEVELS = new Set<NotifyLevel>(["off", "app", "push"]);

const CATEGORY_OF = new Map<NotificationType, CategoryId>(
  NOTIFICATION_CATEGORIES.flatMap((c) => c.types.map((t) => [t as NotificationType, c.id as CategoryId] as const)),
);

/** Lê o JSON salvo (pode ser null, velho ou adulterado): o que faltar ou for inválido vira o padrão. */
export function parsePrefs(raw: unknown): NotificationPrefs {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c) => {
      const v = obj[c.id];
      return [c.id, typeof v === "string" && LEVELS.has(v as NotifyLevel) ? (v as NotifyLevel) : DEFAULT_LEVEL];
    }),
  ) as NotificationPrefs;
}

/** Nível escolhido para um tipo de notificação. Tipo sem categoria = sempre avisa. */
export function levelFor(prefs: NotificationPrefs, type: NotificationType): NotifyLevel {
  const cat = CATEGORY_OF.get(type);
  return cat ? prefs[cat] : DEFAULT_LEVEL;
}

/** Cria a notificação no sino? */
export function wantsInApp(rawPrefs: unknown, type: NotificationType): boolean {
  return levelFor(parsePrefs(rawPrefs), type) !== "off";
}

/** Manda push para o aparelho? */
export function wantsPush(rawPrefs: unknown, type: NotificationType): boolean {
  return levelFor(parsePrefs(rawPrefs), type) === "push";
}
