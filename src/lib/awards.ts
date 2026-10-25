// Títulos e selos exclusivos (sem banco: usado no servidor, no painel e testável).

/** Símbolos com tema pirata. A chave fica salva no banco; o desenho fica em src/components/award-icon.tsx. */
export const AWARD_SYMBOLS = [
  { id: "crown", label: "Coroa" },
  { id: "jolly-roger", label: "Bandeira pirata" },
  { id: "skull", label: "Caveira" },
  { id: "swords", label: "Espadas cruzadas" },
  { id: "straw-hat", label: "Chapéu de palha" },
  { id: "helm", label: "Timão" },
  { id: "anchor", label: "Âncora" },
  { id: "ship", label: "Navio" },
  { id: "compass", label: "Bússola" },
  { id: "map", label: "Mapa do tesouro" },
  { id: "telescope", label: "Luneta" },
  { id: "wanted", label: "Cartaz de recompensa" },
  { id: "berries", label: "Berries" },
  { id: "gem", label: "Tesouro" },
  { id: "bomb", label: "Bala de canhão" },
  { id: "grog", label: "Caneca de grog" },
  { id: "shell", label: "Concha" },
  { id: "waves", label: "Mar" },
  { id: "flame", label: "Chama" },
  { id: "star", label: "Estrela" },
] as const;

/** Estilos do selo, todos dentro da paleta do site (mais o dourado, que já marca prêmios). */
export const AWARD_STYLES = [
  { id: "gold", label: "Ouro" },
  { id: "crimson", label: "Sangue" },
  { id: "silver", label: "Prata" },
  { id: "obsidian", label: "Obsidiana" },
] as const;

export type AwardSymbol = (typeof AWARD_SYMBOLS)[number]["id"];
export type AwardStyle = (typeof AWARD_STYLES)[number]["id"];

const SYMBOLS = new Set<string>(AWARD_SYMBOLS.map((s) => s.id));
const STYLES = new Set<string>(AWARD_STYLES.map((s) => s.id));

export const AWARD_LIMITS = { title: 40, description: 140 } as const;

/** Valores salvos (podem ser null ou de uma versão antiga) → símbolo e estilo válidos. */
export function awardLook(icon: string | null | undefined, style: string | null | undefined): { icon: AwardSymbol; style: AwardStyle } {
  return {
    icon: icon && SYMBOLS.has(icon) ? (icon as AwardSymbol) : "crown",
    style: style && STYLES.has(style) ? (style as AwardStyle) : "gold",
  };
}

export type AwardInput = { text: string; icon: string; style: string; description?: string | null };
export type CleanAward = { text: string; icon: AwardSymbol; style: AwardStyle; description: string | null };

/** Confere o que a moderação digitou. */
export function cleanAward(raw: AwardInput): { ok: true; value: CleanAward } | { ok: false; message: string } {
  const text = String(raw?.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, message: "Escreva o nome do título ou selo." };
  if (text.length > AWARD_LIMITS.title) return { ok: false, message: `No máximo ${AWARD_LIMITS.title} caracteres.` };
  if (!SYMBOLS.has(String(raw?.icon))) return { ok: false, message: "Escolha um símbolo." };
  if (!STYLES.has(String(raw?.style))) return { ok: false, message: "Escolha um estilo." };
  const description = String(raw?.description ?? "").replace(/\s+/g, " ").trim() || null;
  if (description && description.length > AWARD_LIMITS.description) {
    return { ok: false, message: `A descrição tem no máximo ${AWARD_LIMITS.description} caracteres.` };
  }
  return { ok: true, value: { text, icon: raw.icon as AwardSymbol, style: raw.style as AwardStyle, description } };
}

/** Título de um usuário, pronto para exibir (null = sem título). */
export type UserTitleData = { text: string; icon: AwardSymbol; style: AwardStyle } | null;

export function titleOf(u: { title?: string | null; titleIcon?: string | null; titleStyle?: string | null } | null | undefined): UserTitleData {
  if (!u?.title) return null;
  return { text: u.title, ...awardLook(u.titleIcon, u.titleStyle) };
}

/** Campos do usuário que o título precisa (para os `select` do Prisma). */
export const titleSelect = { title: true, titleIcon: true, titleStyle: true } as const;
