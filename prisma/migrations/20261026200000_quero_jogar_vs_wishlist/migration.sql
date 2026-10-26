-- Só dados. Até aqui o botão "Quero jogar" colocava o jogo na wishlist. Agora:
--   "Quero jogar" = fila do que jogar (game_logs.status = 'BACKLOG')
--   Wishlist      = quero comprar (promoções e lançamento)
-- Itens da wishlist de jogos que a pessoa JÁ TEM na Steam não fazem sentido como
-- "quero comprar": viram "Quero jogar" (se o jogo ainda não tem registro) e saem da wishlist.

INSERT INTO "game_logs" ("id", "user_id", "game_id", "status", "created_at", "updated_at")
SELECT 'wl' || substr(md5(w."user_id"::text || w."game_id"), 1, 23), w."user_id", w."game_id", 'BACKLOG', w."created_at", now()
FROM "wishlist_items" w
JOIN "library_entries" l ON l."user_id" = w."user_id" AND l."game_id" = w."game_id" AND l."source" = 'STEAM'
ON CONFLICT ("user_id", "game_id") DO NOTHING;

DELETE FROM "wishlist_items" w
USING "library_entries" l
WHERE l."user_id" = w."user_id" AND l."game_id" = w."game_id" AND l."source" = 'STEAM';
