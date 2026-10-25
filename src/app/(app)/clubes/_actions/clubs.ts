"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isOurImage, removeImage } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";

export type ClubResult = { ok: true; slug?: string } | { ok: false; message: string };

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "clube"
  );
}

export async function createClub(input: { name: string; description: string; imageUrl: string | null }): Promise<ClubResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login para criar um clube." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };

  const name = input.name.trim().slice(0, 60);
  if (name.length < 3) return { ok: false, message: "O nome precisa ter pelo menos 3 caracteres." };
  const limit = await rateLimit("club-create", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };
  const owned = await prisma.club.count({ where: { ownerId: user.id } });
  if (owned >= 10) return { ok: false, message: "Você já criou o máximo de 10 clubes." };

  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${Math.floor(100 + Math.random() * 900)}`;
    try {
      await prisma.club.create({
        data: {
          slug,
          name,
          description: input.description.trim().slice(0, 500) || null,
          imageUrl: isOurImage(input.imageUrl) ? input.imageUrl : null,
          ownerId: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      revalidatePath("/clubes");
      return { ok: true, slug };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  return { ok: false, message: "Não conseguimos criar o clube. Tente outro nome." };
}

export async function toggleMembership(clubId: string): Promise<{ ok: boolean; member?: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { slug: true, ownerId: true } });
  if (!club) return { ok: false };
  if (club.ownerId === user.id) return { ok: false, message: "Você é o dono: para sair, apague o clube." };

  const key = { clubId_userId: { clubId, userId: user.id } };
  const existing = await prisma.clubMember.findUnique({ where: key });
  if (existing) await prisma.clubMember.delete({ where: key });
  else {
    if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };
    await prisma.clubMember.create({ data: { clubId, userId: user.id } });
  }
  revalidatePath(`/clubes/${club.slug}`);
  return { ok: true, member: !existing };
}

export async function postToClub(clubId: string, rawBody: string, rawImage: string | null): Promise<ClubResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };

  const member = await prisma.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId: user.id } },
    select: { club: { select: { slug: true } } },
  });
  if (!member) return { ok: false, message: "Entre no clube para publicar." };

  const body = rawBody.trim().slice(0, 2000);
  const imageUrl = isOurImage(rawImage) ? rawImage : null;
  if (!body && !imageUrl) return { ok: false, message: "Escreva alguma coisa." };
  const limit = await rateLimit("club-post", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };

  await prisma.clubPost.create({ data: { clubId, userId: user.id, body, imageUrl } });
  revalidatePath(`/clubes/${member.club.slug}`);
  return { ok: true };
}

/** Autor, dono ou admin do clube apagam o post. */
export async function deleteClubPost(postId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const post = await prisma.clubPost.findUnique({ where: { id: postId }, select: { userId: true, imageUrl: true, clubId: true, club: { select: { slug: true } } } });
  if (!post) return { ok: false };

  let allowed = post.userId === user.id || user.isAdmin;
  if (!allowed) {
    const m = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: post.clubId, userId: user.id } }, select: { role: true } });
    allowed = m?.role === "OWNER" || m?.role === "ADMIN";
  }
  if (!allowed) return { ok: false };

  await prisma.clubPost.delete({ where: { id: postId } });
  await removeImage(post.imageUrl);
  revalidatePath(`/clubes/${post.club.slug}`);
  return { ok: true };
}

export async function deleteClub(clubId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { ownerId: true, imageUrl: true } });
  if (!club || (club.ownerId !== user.id && !user.isAdmin)) return { ok: false };
  await prisma.club.delete({ where: { id: clubId } });
  await removeImage(club.imageUrl);
  revalidatePath("/clubes");
  return { ok: true };
}
