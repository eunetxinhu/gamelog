import "server-only";
import { prisma } from "@/lib/prisma";
import { blockedIds } from "@/lib/privacy";
import { escapeLike, FUZZY_THRESHOLD, normalizeQuery } from "@/lib/search-query";

/**
 * Busca tolerante a erros de digitação com pg_trgm (índices GIN criados na migration
 * "fotos_lancamentos_busca"). "zelda breth" acha "The Legend of Zelda: Breath of the Wild".
 *
 * word_similarity(q, título) compara o que foi digitado com o trecho mais parecido do
 * título, então funciona bem com buscas curtas dentro de nomes longos. A extensão fica
 * no schema "extensions" (padrão do Supabase), por isso os nomes vão qualificados.
 */

export type LocalGameHit = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  steamAppId: number | null;
  year: number | null;
  score: number;
};

/** Jogos que já estão no banco (alguém abriu, registrou ou tem na biblioteca). */
export async function searchLocalGames(raw: string, limit = 12): Promise<LocalGameHit[]> {
  const q = normalizeQuery(raw);
  if (q.length < 2) return [];
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;

  const [, rows] = await prisma.$transaction([
    // Limite do operador <% só para esta transação
    prisma.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${FUZZY_THRESHOLD}`),
    prisma.$queryRaw<
      { id: string; slug: string; title: string; cover_url: string | null; steam_app_id: number | null; release_date: Date | null; score: number }[]
    >`
      SELECT id, slug, title, cover_url, steam_app_id, release_date,
             extensions.word_similarity(${q}, title)::float8 AS score
      FROM games
      WHERE title ILIKE ${like} OR ${q} OPERATOR(extensions.<%) title
      ORDER BY (title ILIKE ${prefix}) DESC, score DESC, length(title), title
      LIMIT ${limit}`,
  ]);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    coverUrl: r.cover_url,
    steamAppId: r.steam_app_id,
    year: r.release_date ? r.release_date.getUTCFullYear() : null,
    score: Number(r.score),
  }));
}

/**
 * Pessoas por @usuario ou nome, mais parecidas primeiro. Esconde suspensos e
 * bloqueios (dos dois lados). Devolve os ids na ordem de relevância.
 */
export async function searchUserIds(raw: string, viewerId: string | null, limit = 30): Promise<string[]> {
  const q = normalizeQuery(raw);
  if (q.length < 2) return [];
  const like = `%${escapeLike(q)}%`;
  const hidden = await blockedIds(viewerId);

  const [, rows] = await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${FUZZY_THRESHOLD}`),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE banned_at IS NULL
        AND NOT (id::text = ANY(${hidden}::text[]))
        AND (
          username ILIKE ${like} OR display_name ILIKE ${like}
          OR ${q} OPERATOR(extensions.<%) username
          OR ${q} OPERATOR(extensions.<%) display_name
        )
      ORDER BY GREATEST(
                 extensions.word_similarity(${q}, username),
                 COALESCE(extensions.word_similarity(${q}, display_name), 0)
               ) DESC,
               username
      LIMIT ${limit}`,
  ]);
  return rows.map((r) => r.id);
}
