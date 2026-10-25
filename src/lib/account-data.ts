import "server-only";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient, hasSupabaseAdmin } from "@/lib/supabase/admin";
import { removeUserFiles } from "@/lib/uploads";

/**
 * Dados pessoais (LGPD, art. 18): exportar tudo o que o Poneglyph.gg guarda sobre a
 * pessoa e excluir a conta de verdade (perfil, publicações, mensagens e arquivos).
 */

/** Formato do arquivo exportado. Mude o número se a estrutura mudar. */
export const EXPORT_VERSION = 1;

const gameRef = { select: { title: true, slug: true, steamAppId: true } } as const;
const userRef = { select: { username: true } } as const;

/** Tudo o que é da pessoa, em JSON legível. */
export async function buildAccountExport(userId: string) {
  const [user, logs, library, activities, comments, reactions, following, followers, wishlist, favorites, conversations, clubs, clubPosts, blocks, reports, notifications, pushDevices] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { invitedBy: userRef, _count: { select: { invitees: true } } } }),
      prisma.gameLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, include: { game: gameRef } }),
      prisma.libraryEntry.findMany({ where: { userId }, orderBy: { importedAt: "asc" }, include: { game: gameRef } }),
      prisma.activity.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, include: { game: gameRef } }),
      prisma.comment.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true, activityId: true } }),
      prisma.activityLike.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true, activityId: true } }),
      prisma.follow.findMany({ where: { followerId: userId }, select: { status: true, createdAt: true, following: userRef } }),
      prisma.follow.findMany({ where: { followingId: userId }, select: { status: true, createdAt: true, follower: userRef } }),
      prisma.wishlistItem.findMany({ where: { userId }, select: { createdAt: true, game: gameRef } }),
      prisma.favoriteGame.findMany({ where: { userId }, orderBy: { position: "asc" }, select: { position: true, game: gameRef } }),
      prisma.conversation.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: {
          userA: userRef,
          userB: userRef,
          userAId: true,
          messages: { orderBy: { createdAt: "asc" }, select: { senderId: true, body: true, imageUrl: true, createdAt: true } },
        },
      }),
      prisma.clubMember.findMany({ where: { userId }, select: { role: true, joinedAt: true, club: { select: { name: true, slug: true } } } }),
      prisma.clubPost.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { body: true, imageUrl: true, createdAt: true, club: { select: { slug: true } } } }),
      prisma.block.findMany({ where: { blockerId: userId }, select: { createdAt: true, blocked: userRef } }),
      prisma.report.findMany({ where: { reporterId: userId }, select: { targetType: true, targetId: true, reason: true, details: true, status: true, createdAt: true } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500, select: { type: true, createdAt: true, readAt: true } }),
      prisma.pushSubscription.findMany({ where: { userId }, select: { userAgent: true, createdAt: true } }),
    ]);

  const [lists, listLikes, listComments] = await Promise.all([
    prisma.gameList.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { items: { orderBy: { position: "asc" }, select: { position: true, note: true, game: gameRef } } },
    }),
    prisma.gameListLike.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { listId: true, createdAt: true } }),
    prisma.gameListComment.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { listId: true, body: true, createdAt: true } }),
  ]);

  const game = (g: { title: string; slug: string; steamAppId: number | null }) => ({ titulo: g.title, slug: g.slug, steamAppId: g.steamAppId });

  return {
    formato: EXPORT_VERSION,
    exportadoEm: new Date().toISOString(),
    aviso: "Todos os dados que o Poneglyph.gg guarda sobre você. Mensagens incluem as duas pessoas da conversa.",
    perfil: {
      usuario: user.username,
      nome: user.displayName,
      bio: user.bio,
      avatar: user.avatarUrl,
      capa: user.bannerUrl,
      perfilPrivado: user.isPrivate,
      quemPodeMandarMensagem: user.dmPolicy,
      criadoEm: user.createdAt,
      ultimaVisita: user.lastSeenAt,
      convidadoPor: user.invitedBy?.username ?? null,
      pessoasConvidadas: user._count.invitees,
    },
    steam: user.steamId
      ? { steamId: user.steamId, nome: user.steamPersonaName, avatar: user.steamAvatarUrl, ultimaSincronizacao: user.steamLastSyncAt }
      : null,
    registros: logs.map((l) => ({
      jogo: game(l.game),
      status: l.status,
      nota: l.rating,
      review: l.review,
      contemSpoiler: l.containsSpoiler,
      comecouEm: l.startedAt,
      terminouEm: l.finishedAt,
      criadoEm: l.createdAt,
      atualizadoEm: l.updatedAt,
    })),
    biblioteca: library.map((e) => ({
      jogo: game(e.game),
      origem: e.source,
      minutosJogados: e.playtimeMinutes,
      ultimaVezJogado: e.lastPlayedAt,
      conquistas: e.achievementsTotal ? { desbloqueadas: e.achievementsUnlocked, total: e.achievementsTotal } : null,
      platinadoEm: e.platinumAt,
    })),
    publicacoes: activities.map((a) => ({
      id: a.id,
      tipo: a.type,
      origem: a.source,
      jogo: game(a.game),
      nota: a.rating,
      texto: a.review,
      fotos: a.images.length ? a.images : a.imageUrl ? [a.imageUrl] : [],
      criadoEm: a.createdAt,
    })),
    comentarios: comments.map((c) => ({ publicacao: c.activityId, texto: c.body, criadoEm: c.createdAt })),
    reacoes: reactions.map((r) => ({ publicacao: r.activityId, tipo: r.type, criadoEm: r.createdAt })),
    seguindo: following.map((f) => ({ usuario: f.following.username, status: f.status, desde: f.createdAt })),
    seguidores: followers.map((f) => ({ usuario: f.follower.username, status: f.status, desde: f.createdAt })),
    wishlist: wishlist.map((w) => ({ jogo: game(w.game), adicionadoEm: w.createdAt })),
    favoritos: favorites.map((f) => ({ posicao: f.position, jogo: game(f.game) })),
    listas: lists.map((l) => ({
      id: l.id,
      nome: l.title,
      descricao: l.description,
      numerada: l.ranked,
      criadaEm: l.createdAt,
      jogos: l.items.map((i) => ({ posicao: i.position, jogo: game(i.game), comentario: i.note })),
    })),
    listasCurtidas: listLikes.map((l) => ({ lista: l.listId, curtidaEm: l.createdAt })),
    comentariosEmListas: listComments.map((c) => ({ lista: c.listId, texto: c.body, criadoEm: c.createdAt })),
    mensagens: conversations.map((c) => {
      const other = c.userAId === userId ? c.userB.username : c.userA.username;
      return {
        com: other,
        mensagens: c.messages.map((m) => ({ de: m.senderId === userId ? "você" : other, texto: m.body, foto: m.imageUrl, enviadaEm: m.createdAt })),
      };
    }),
    clubes: clubs.map((m) => ({ clube: m.club.name, slug: m.club.slug, papel: m.role, entrouEm: m.joinedAt })),
    postsEmClubes: clubPosts.map((p) => ({ clube: p.club.slug, texto: p.body, foto: p.imageUrl, criadoEm: p.createdAt })),
    bloqueados: blocks.map((b) => ({ usuario: b.blocked.username, desde: b.createdAt })),
    denunciasFeitas: reports.map((r) => ({ alvo: r.targetType, id: r.targetId, motivo: r.reason, detalhes: r.details, status: r.status, criadaEm: r.createdAt })),
    notificacoesRecentes: notifications.map((n) => ({ tipo: n.type, criadaEm: n.createdAt, lidaEm: n.readAt })),
    aparelhosComPush: pushDevices.map((p) => ({ navegador: p.userAgent, desde: p.createdAt })),
  };
}

export type DeleteResult = { ok: true } | { ok: false; message: string };

/**
 * Exclui a conta:
 *  1. clubes que a pessoa criou passam para o admin (ou membro) mais antigo; sem ninguém, são apagados
 *  2. apaga o usuário no Supabase Auth; o trigger on_auth_user_deleted apaga o perfil e,
 *     em cascata, publicações, comentários, reações, mensagens, follows, biblioteca…
 *  3. apaga as imagens dela no Storage (menos as capas dos clubes que foram passados adiante)
 * O Auth vem antes dos arquivos: se ele falhar, a conta continua inteira (com as fotos).
 */
export async function deleteAccount(userId: string): Promise<DeleteResult> {
  if (!hasSupabaseAdmin()) {
    return { ok: false, message: "A exclusão automática não está disponível agora. Fale com a moderação para excluir sua conta." };
  }

  // 1) Clubes: não apagar a comunidade dos outros junto
  const owned = await prisma.club.findMany({ where: { ownerId: userId }, select: { id: true, imageUrl: true } });
  const keepFiles: string[] = [];
  for (const club of owned) {
    const heir = await prisma.clubMember.findFirst({
      where: { clubId: club.id, userId: { not: userId }, user: { bannedAt: null } },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }], // OWNER < ADMIN < MEMBER na ordem do enum
      select: { userId: true },
    });
    if (!heir) continue; // ninguém mais no clube: some junto com a conta
    await prisma.$transaction([
      prisma.club.update({ where: { id: club.id }, data: { ownerId: heir.userId } }),
      prisma.clubMember.update({ where: { clubId_userId: { clubId: club.id, userId: heir.userId } }, data: { role: "OWNER" } }),
    ]);
    if (club.imageUrl) keepFiles.push(club.imageUrl);
  }

  // 2) Conta
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error && !/not.?found/i.test(error.message)) {
    console.error("[conta] exclusão no Auth", error.message);
    return { ok: false, message: "Não foi possível excluir agora. Tente de novo em instantes." };
  }
  // Se o trigger não existir (ambiente sem a migration "social"), apaga o perfil direto
  await prisma.user.deleteMany({ where: { id: userId } });

  // 3) Arquivos (falha aqui não volta a conta: fica no log para limpar à mão)
  await removeUserFiles(userId, keepFiles).catch((err) => console.error("[conta] arquivos de", userId, err));
  return { ok: true };
}
