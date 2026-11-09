import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getPlayerSummary } from "@/lib/steam/api";
import { applyReferral, findInviter } from "@/lib/referral";
import { startSession } from "@/lib/session";

/**
 * "Entrar com Steam" sem conta no site:
 *  1. Já existe perfil com esse SteamID → entra nele (inclusive contas de e-mail que vincularam a Steam).
 *  2. Não existe → cria o perfil já vinculado (conta só da Steam: sem e-mail nem senha).
 *  3. Abre a sessão (src/lib/session.ts).
 * Só chamar depois que o SteamID foi confirmado pela Steam (verifySteamLogin).
 */
export async function signInWithSteam(steamId: string, ref: string | null = null): Promise<{ isNew: boolean }> {
  const existing = await prisma.user.findUnique({ where: { steamId }, select: { id: true } });
  if (existing) {
    await startSession(existing.id);
    return { isNew: false };
  }

  const summary = await getPlayerSummary(steamId);
  const persona = summary.ok ? (summary.data?.personaname ?? null) : null;
  const avatar = summary.ok ? (summary.data?.avatarfull ?? null) : null;
  const id = randomUUID();
  const inviter = await findInviter(ref);
  const userId = await createProfile(id, steamId, persona, avatar, inviter?.id ?? null);
  if (inviter && userId === id) await applyReferral(id, inviter);
  await startSession(userId);
  return { isNew: userId === id };
}

async function createProfile(id: string, steamId: string, persona: string | null, avatar: string | null, invitedById: string | null): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const username = await availableUsername(persona, attempt);
    try {
      await prisma.user.create({
        data: { id, username, displayName: persona, steamId, steamPersonaName: persona, steamAvatarUrl: avatar, invitedById, authAccount: { create: {} } },
      });
      return id;
    } catch (err) {
      const target = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" ? String(err.meta?.target ?? "") : "";
      // Outro request (clique duplo) criou o perfil dessa Steam junto: entra nele
      if (target.includes("steam")) {
        const other = await prisma.user.findUnique({ where: { steamId }, select: { id: true } });
        if (other) return other.id;
      }
      // Corrida no username: tenta outro sufixo. Outros conflitos sobem.
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
