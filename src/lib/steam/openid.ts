import "server-only";
import { appUrl } from "@/lib/app-url";

/**
 * "Entrar com Steam" (OpenID 2.0).
 * É o único jeito de vincular a Steam: quem diz qual é a conta é a própria
 * Steam, depois que o usuário faz login no site oficial. A resposta que volta
 * no callback é conferida com a Steam (check_authentication) antes de valer.
 */

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;
const TIMEOUT_MS = 10_000;

/** Campos que precisam estar assinados pela Steam para a resposta valer. */
const REQUIRED_SIGNED = ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"];

export const STEAM_STATE_COOKIE = "steam_openid_state";
export const STEAM_MODE_COOKIE = "steam_openid_mode";
/** link = vincular à conta logada; signin = entrar/criar conta pela Steam */
export type SteamLoginMode = "link" | "signin";
export const CALLBACK_PATH = "/api/steam/callback";

/** URL do login oficial da Steam. `state` volta no return_to e é conferido no callback. */
export function steamLoginUrl(state: string) {
  const origin = appUrl();
  const returnTo = new URL(CALLBACK_PATH, origin);
  returnTo.searchParams.set("state", state);

  const url = new URL(STEAM_OPENID);
  url.search = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo.toString(),
    "openid.realm": origin,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  }).toString();
  return url.toString();
}

export type SteamLoginResult =
  | { ok: true; steamId: string }
  | { ok: false; reason: "CANCELLED" | "INVALID" | "UNAVAILABLE" };

/**
 * Valida a resposta do callback e devolve o SteamID64 confirmado pela Steam.
 * @param params        query string recebida em /api/steam/callback
 * @param expectedState valor do cookie gravado em /api/steam/login
 */
export async function verifySteamLogin(params: URLSearchParams, expectedState: string | undefined): Promise<SteamLoginResult> {
  const mode = params.get("openid.mode");
  if (mode === "cancel") return { ok: false, reason: "CANCELLED" };
  if (mode !== "id_res") return { ok: false, reason: "INVALID" };

  // 1) O login foi iniciado por este navegador (evita vincular a conta de outra pessoa via link forjado)
  const state = params.get("state");
  if (!expectedState || !state || state !== expectedState) return { ok: false, reason: "INVALID" };

  // 2) Conferências locais da resposta
  if (params.get("openid.ns") !== OPENID_NS) return { ok: false, reason: "INVALID" };
  if (params.get("openid.op_endpoint") !== STEAM_OPENID) return { ok: false, reason: "INVALID" };

  const returnTo = params.get("openid.return_to");
  const expectedReturn = new URL(CALLBACK_PATH, appUrl());
  expectedReturn.searchParams.set("state", expectedState);
  if (returnTo !== expectedReturn.toString()) return { ok: false, reason: "INVALID" };

  const claimedId = params.get("openid.claimed_id") ?? "";
  const match = claimedId.match(CLAIMED_ID);
  if (!match || params.get("openid.identity") !== claimedId) return { ok: false, reason: "INVALID" };

  const signed = (params.get("openid.signed") ?? "").split(",");
  if (!REQUIRED_SIGNED.every((f) => signed.includes(f)) || !params.get("openid.sig")) {
    return { ok: false, reason: "INVALID" };
  }

  // 3) A Steam confirma que foi ela quem assinou (e invalida o nonce)
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");

  let text: string;
  try {
    const res = await fetch(STEAM_OPENID, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: "UNAVAILABLE" };
    text = await res.text();
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const isValid = text.split("\n").some((line) => line.trim() === "is_valid:true");
  if (!isValid) return { ok: false, reason: "INVALID" };

  return { ok: true, steamId: match[1] };
}
