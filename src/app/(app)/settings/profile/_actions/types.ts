// Tipos compartilhados entre as Server Actions, o callback da Steam e os Client Components.
// (Arquivos "use server" só podem exportar funções async, por isso ficam aqui.)

/** Erros do "Entrar com Steam" (chegam na página via ?steam_error=CODE). */
export type SteamLinkErrorCode =
  | "STEAM_LOGIN_CANCELLED" // o usuário voltou sem fazer login na Steam
  | "STEAM_LOGIN_INVALID"   // resposta não confirmada pela Steam (expirada, adulterada…)
  | "STEAM_ALREADY_LINKED"  // conta Steam já vinculada a outro usuário
  | "STEAM_UNAVAILABLE"
  | "UNKNOWN";

export const STEAM_LINK_MESSAGES: Record<SteamLinkErrorCode, string> = {
  STEAM_LOGIN_CANCELLED: "O login na Steam foi cancelado. Nada foi alterado.",
  STEAM_LOGIN_INVALID: "Não conseguimos confirmar o login na Steam. Tente entrar de novo.",
  STEAM_ALREADY_LINKED: "Essa conta Steam já está vinculada a outro perfil.",
  STEAM_UNAVAILABLE: "A Steam não respondeu. Tente novamente em instantes.",
  UNKNOWN: "Algo deu errado ao vincular a Steam. Tente novamente.",
};

export type SteamSyncErrorCode =
  | SteamLinkErrorCode
  | "UNAUTHENTICATED"
  | "STEAM_NOT_LINKED"      // nenhuma conta Steam vinculada
  | "STEAM_NOT_FOUND"       // SteamID salvo não corresponde a nenhum perfil
  | "STEAM_PRIVATE"         // perfil ou "Detalhes dos jogos" privados
  | "SYNC_COOLDOWN"         // sincronizou há pouco tempo
  | "STEAM_RATE_LIMITED";

export type SteamPrivacyReason =
  | "PROFILE"       // o perfil inteiro está privado/só amigos
  | "GAME_DETAILS"; // perfil público, mas "Detalhes dos jogos" privados

export type SteamSyncError = {
  code: SteamSyncErrorCode;
  message: string;
  /** Só em STEAM_PRIVATE */
  privacyReason?: SteamPrivacyReason;
  /** Só em SYNC_COOLDOWN */
  retryAfterSeconds?: number;
};

export type SteamSyncSuccess = {
  steamId: string;
  personaName: string;
  avatarUrl: string;
  totalGames: number;
  newGames: number;
  updatedGames: number;
  removedGames: number;
  totalHours: number;
  recentlyPlayed: { appId: number; name: string; hours2Weeks: number }[];
  /** Publicações criadas no feed por esta sincronização */
  posted: { platinums: number; started: number; rare: number };
  syncedAt: string; // ISO
};

export type SteamSyncResult =
  | { ok: true; data: SteamSyncSuccess }
  | { ok: false; error: SteamSyncError };

