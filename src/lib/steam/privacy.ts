// Regra de privacidade da sincronização (sem rede: testável).

export type OwnedGamesPayload = { game_count?: number; games?: unknown[] };

export type PrivacyVerdict = { private: false } | { private: true; reason: "PROFILE" | "GAME_DETAILS" };

/**
 * Perfil com "Detalhes dos jogos" privados: a Steam responde 200 OK com
 * `{ "response": {} }` — `games` vem undefined. Isso NÃO é erro de rede nem
 * biblioteca vazia (que vem como `{ game_count: 0 }`): é configuração de privacidade.
 *
 * `communityVisibility` (GetPlayerSummaries): 3 = público; qualquer outro = privado/amigos.
 * Perfil privado bloqueia tudo; perfil público com jogos ocultos é só "Detalhes dos jogos".
 */
export function detectSteamPrivacy(owned: OwnedGamesPayload, communityVisibility: number): PrivacyVerdict {
  if (owned.games !== undefined || owned.game_count === 0) return { private: false };
  return { private: true, reason: communityVisibility !== 3 ? "PROFILE" : "GAME_DETAILS" };
}
