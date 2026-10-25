-- Selo exclusivo do fundador. Só cria se ainda não existir (dá para editar ou tirar
-- depois pelo botão Premiar do perfil).
INSERT INTO "awarded_badges" ("id", "user_id", "name", "description", "icon", "style", "awarded_by_id")
SELECT 'selo-gabe-nordestino', u."id", 'Gabe Newell Nordestino', 'O dono da Steam do Nordeste', 'helm', 'crimson', u."id"
FROM "users" u
WHERE u."username" = 'eunetxinhu'
  AND NOT EXISTS (SELECT 1 FROM "awarded_badges" b WHERE b."user_id" = u."id" AND b."name" = 'Gabe Newell Nordestino');
