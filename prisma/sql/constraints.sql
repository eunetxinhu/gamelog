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

-- (Histórico) No Supabase havia um trigger em auth.users que apagava o perfil junto
-- com a conta. Com o login próprio, auth_accounts tem FK com cascade para users.

-- Segurança: o app acessa o banco só pelo Prisma, no servidor. RLS ligado e sem
-- policies bloqueia qualquer outro acesso (era essencial no Supabase, que expunha o
-- schema "public" pela Data API; na Neon fica como camada extra).
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
