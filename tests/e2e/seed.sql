-- Dados dos testes de ponta a ponta (Playwright). Rodar depois de `prisma migrate deploy`.
-- Idempotente: apaga e recria só o que é dos testes.
DELETE FROM users WHERE id IN (
  'e2e00000-0000-4000-8000-000000000001',
  'e2e00000-0000-4000-8000-000000000002',
  'e2e00000-0000-4000-8000-000000000003'
);
DELETE FROM games WHERE id = 'e2e-jogo';

-- Duas contas antigas (já passaram das 72 h de conta nova) e uma criada agora
INSERT INTO users (id, username, display_name, created_at, updated_at, onboarded_at) VALUES
  ('e2e00000-0000-4000-8000-000000000001', 'e2e_ana',  'Ana E2E',  now() - interval '30 days', now(), now()),
  ('e2e00000-0000-4000-8000-000000000002', 'e2e_bia',  'Bia E2E',  now() - interval '30 days', now(), now()),
  ('e2e00000-0000-4000-8000-000000000003', 'e2e_novo', 'Novo E2E', now(),                       now(), now());

-- Jogo sem Steam e já "sincronizado": a página não chama nenhuma API de fora
INSERT INTO games (id, slug, title, summary, genres, synced_at, media_synced_at, created_at, updated_at) VALUES
  ('e2e-jogo', 'jogo-e2e', 'Jogo Ponta a Ponta', 'Um jogo de mentira para os testes.', ARRAY['Aventura'], now(), now(), now(), now());

-- Uma publicação da Bia para comentar
INSERT INTO activities (id, user_id, game_id, type, review, created_at) VALUES
  ('e2e-post-1', 'e2e00000-0000-4000-8000-000000000002', 'e2e-jogo', 'COMPLETED', 'Zerei! Final muito bom.', now() - interval '1 hour');

-- Uma lista da Ana para o teste de apagar
INSERT INTO game_lists (id, user_id, title, created_at, updated_at) VALUES
  ('e2e-lista', 'e2e00000-0000-4000-8000-000000000001', 'Lista E2E para apagar', now(), now());
INSERT INTO game_list_items (list_id, game_id, position) VALUES ('e2e-lista', 'e2e-jogo', 1);
