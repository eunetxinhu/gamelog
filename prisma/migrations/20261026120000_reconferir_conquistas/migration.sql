-- Só dados. Até aqui, uma falha da Steam (limite, timeout) ao buscar as conquistas
-- marcava o jogo como "conferido, sem conquistas" e ele nunca mais era conferido
-- (a não ser que a pessoa jogasse de novo). Volta esses jogos para a fila: a próxima
-- sincronização de cada pessoa confere de novo. Jogos que já têm o progresso salvo
-- ou platina não mudam.
UPDATE "library_entries"
SET "achievements_checked_at" = NULL
WHERE "achievements_checked_at" IS NOT NULL
  AND "achievements_total" IS NULL
  AND "platinum_at" IS NULL;

-- E faz o cron passar em todo mundo com Steam logo, em vez de esperar até 3 dias
UPDATE "users"
SET "steam_next_sync_at" = now()
WHERE "steam_id" IS NOT NULL;
