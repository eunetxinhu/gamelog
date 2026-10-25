-- =============================================================================
--  Rodar UMA vez após a primeira migration:
--    npx prisma migrate dev --name init --create-only
--    (cole este arquivo no final do migration.sql gerado)  →  npx prisma migrate dev
-- =============================================================================

-- Regras de domínio que o Prisma não expressa ---------------------------------
ALTER TABLE game_logs
  ADD CONSTRAINT game_logs_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

ALTER TABLE favorite_games
  ADD CONSTRAINT favorite_games_position_range CHECK (position BETWEEN 1 AND 4);

ALTER TABLE follows
  ADD CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id);

ALTER TABLE users
  ADD CONSTRAINT users_steam_id_format CHECK (steam_id IS NULL OR steam_id ~ '^7656119[0-9]{10}$');

-- Vínculo com o Supabase Auth: apagar a conta remove o perfil.
-- É um trigger (criado na migration "social"), não FK: FK para auth.users
-- quebra o `prisma migrate dev` por ser referência entre schemas.

-- Segurança: o app acessa o banco só pelo Prisma (role postgres, server-side).
-- O Supabase expõe o schema "public" via Data API com a anon key; sem RLS,
-- QUALQUER visitante leria os dados dos usuários. RLS ligado e sem policies = bloqueado.
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE games           ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_games  ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows         ENABLE ROW LEVEL SECURITY;
-- activities e activity_likes: RLS ligado na migration "social"
-- Condicional: no shadow database do `prisma migrate dev` essa tabela não existe.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE _prisma_migrations ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
