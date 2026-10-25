import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerSummary } from "@/lib/steam/api";
import { applyReferral, findInviter } from "@/lib/referral";

/**
 * "Entrar com Steam" sem conta no GameLog (o Supabase não tem a Steam como provedor):
 *  1. Já existe perfil com esse SteamID → entra nele (inclusive contas de e-mail que vincularam a Steam).
 *  2. Não existe → cria um usuário no Supabase Auth com e-mail interno e o perfil já vinculado.
 *  3. Abre a sessão: gera um magic link pela API de admin (nenhum e-mail é enviado) e
 *     valida o token aqui mesmo, o que grava os cookies de sessão.
 * Só chamar depois que o SteamID foi confirmado pela Steam (verifySteamLogin).
 */
export async function signInWithSteam(steamId: string, ref: string | null = null): Promise<{ isNew: boolean }> {
  const admin = createSupabaseAdminClient();
  const existing = await prisma.user.findUnique({ where: { steamId }, select: { id: true } });

  let email: string;
  let profile: { persona: string | null; avatar: string | null } | null = null; // só para conta nova

  if (existing) {
    const { data, error } = await admin.auth.admin.getUserById(existing.id);
    if (error || !data.user?.email) throw new Error(`perfil sem usuário no Auth: ${error?.message ?? "sem e-mail"}`);
    email = data.user.email;
  } else {
    email = steamEmail(steamId);
    const summary = await getPlayerSummary(steamId);
    profile = {
      persona: summary.ok ? (summary.data?.personaname ?? null) : null,
      avatar: summary.ok ? (summary.data?.avatarfull ?? null) : null,
    };
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { steam_id: steamId, full_name: profile.persona, avatar_url: profile.avatar },
    });
    // email_exists: usuário criado numa tentativa anterior que caiu antes do perfil
    if (created.error && created.error.code !== "email_exists") throw created.error;
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  if (profile) {
    const inviter = await findInviter(ref);
    await createProfile(link.data.user.id, steamId, profile.persona, profile.avatar, inviter?.id ?? null);
    if (inviter) await applyReferral(link.data.user.id, inviter);
  }
  await openSession(link.data.properties.hashed_token);
  return { isNew: Boolean(profile) };
}

const STEAM_EMAIL_DOMAIN = "@steam-login.gamelog.app";

/** E-mail interno das contas criadas pela Steam (nunca recebe mensagens). */
function steamEmail(steamId: string) {
  return `steam-${steamId}${STEAM_EMAIL_DOMAIN}`;
}

/** Conta criada só pela Steam (sem senha): a Steam é o único jeito de entrar nela. */
export function isSteamOnlyEmail(email: string | null | undefined) {
  return Boolean(email?.endsWith(STEAM_EMAIL_DOMAIN));
}

async function openSession(tokenHash: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) throw error;
}

async function createProfile(id: string, steamId: string, persona: string | null, avatar: string | null, invitedById: string | null) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const username = await availableUsername(persona, attempt);
    try {
      await prisma.user.upsert({
        where: { id },
        create: { id, username, displayName: persona, steamId, steamPersonaName: persona, steamAvatarUrl: avatar, invitedById },
        update: { steamId },
      });
      return;
    } catch (err) {
      // Corrida no username: tenta outro sufixo. Outros conflitos sobem.
      const target = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" ? String(err.meta?.target ?? "") : "";
      if (!target.includes("username")) throw err;
    }
  }
  throw new Error("não foi possível escolher um nome de usuário");
}

/** Nome da Steam → nome de usuário válido (a-z, 0-9, _), com sufixo se já existir. */
async function availableUsername(persona: string | null, attempt: number) {
  let base = (persona ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  if (base.length < 3) base = "player";

  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 && attempt === 0 ? base : `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}
