# Poneglyph.gg — rede social de registro e avaliação de jogos

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Postgres na Neon · Cloudflare R2 (fotos) · login próprio (bcrypt + sessão em cookie) · Prisma 7 · RAWG/IGDB · Steam Web API + Steam OpenID

---

## 1. Estrutura de pastas

`✅` = entregue neste esqueleto · o resto é a estrutura recomendada para as próximas features.

```
gamelog/
├─ prisma/
│  ├─ schema.prisma                         ✅ modelos + enums
│  └─ sql/constraints.sql                   ✅ CHECKs, FK p/ auth.users e RLS
├─ prisma.config.ts                         ✅ (Prisma 7: URL do banco fica aqui)
└─ src/
   ├─ proxy.ts                              ✅ (Next 16: antigo middleware.ts) renova sessão + protege rotas
   ├─ app/
   │  ├─ layout.tsx                         ✅
   │  ├─ globals.css                        ✅
   │  ├─ (marketing)/
   │  │  └─ page.tsx                        landing pública
   │  ├─ (auth)/
   │  │  ├─ login/page.tsx
   │  │  ├─ signup/page.tsx
   │  │  └─ auth/confirmar/route.ts         link do e-mail de confirmação → sessão
   │  ├─ (app)/                             área logada (layout com navbar)
   │  │  ├─ layout.tsx
   │  │  ├─ feed/
   │  │  │  ├─ page.tsx                     abas Seguindo / Global
   │  │  │  ├─ loading.tsx
   │  │  │  └─ _components/
   │  │  │     └─ activity-card.tsx         log/review do autor
   │  │  ├─ games/
   │  │  │  ├─ page.tsx                     busca no catálogo (RAWG) via ?q=
   │  │  │  └─ [slug]/
   │  │  │     ├─ page.tsx                  detalhes, nota média, reviews
   │  │  │     ├─ _actions/log.ts           upsertGameLog (status + nota 1–5 + review)
   │  │  │     └─ _components/log-dialog.tsx
   │  │  ├─ u/[username]/
   │  │  │  ├─ page.tsx                     perfil: stats, top 4, atividade
   │  │  │  ├─ _actions/follow.ts           follow/unfollow
   │  │  │  ├─ backlog/page.tsx
   │  │  │  ├─ reviews/page.tsx
   │  │  │  ├─ library/page.tsx             biblioteca Steam + horas
   │  │  │  ├─ followers/page.tsx
   │  │  │  └─ following/page.tsx
   │  │  └─ settings/
   │  │     ├─ layout.tsx
   │  │     ├─ account/page.tsx             nome, avatar, top 4
   │  │     └─ profile/                     ✅ contas vinculadas
   │  │        ├─ page.tsx                  ✅ Server Component (lê ?steam=linked / ?steam_error=)
   │  │        ├─ _actions/
   │  │        │  ├─ steam.ts               ✅ syncSteamLibrary / unlinkSteam
   │  │        │  └─ types.ts               ✅ contratos de erro (STEAM_PRIVATE etc.)
   │  │        └─ _components/
   │  │           ├─ profile-connections-form.tsx  ✅ Client Component
   │  │           └─ steam-privacy-notice.tsx      ✅ aviso + passo a passo
   │  └─ api/
   │     ├─ steam/login/route.ts            ✅ "Entrar com Steam" → login oficial
   │     ├─ steam/callback/route.ts         ✅ confere a resposta com a Steam e salva o SteamID
   │     └─ cron/steam-resync/route.ts      re-sincroniza bibliotecas 1x/dia
   ├─ components/
   │  ├─ game-cover.tsx
   │  └─ rating-stars.tsx
   ├─ lib/
   │  ├─ prisma.ts                          ✅ singleton + @prisma/adapter-pg
   │  ├─ auth.ts                            ✅ getCurrentUser() pela sessão
   │  ├─ session.ts                         ✅ sessão (cookie httpOnly + tabela sessions)
   │  ├─ auth/accounts.ts                   ✅ cadastro, senha, links de e-mail
   │  ├─ r2.ts                              ✅ fotos no Cloudflare R2 (S3)
   │  ├─ steam/api.ts                       ✅ cliente tipado da Steam Web API
   │  ├─ steam/openid.ts                    ✅ Steam OpenID 2.0 (URL de login + validação)
   │  └─ catalog/rawg.ts                    busca + upsert em `games`
   └─ generated/prisma/                     (gerado, no .gitignore)
```

Convenção: `_actions` e `_components` (pastas com `_`) são privadas da rota e não viram URL. Server Actions moram ao lado da tela que as usa.

### Onde fica cada funcionalidade nova

| Funcionalidade | Arquivos principais |
| --- | --- |
| Post de fotos no feed (do aparelho, sempre com jogo) | `feed/_components/photo-composer.tsx`, `feed/_actions/photo-post.ts`, `lib/photo-post.ts`, `components/photo-grid.tsx` |
| Tempo para zerar (jogo e backlog) | `lib/time-to-beat.ts`, `games/[slug]/_components/time-to-beat.tsx`, aba Backlog |
| Progresso de conquistas por jogo | `lib/achievement-stats.ts`, aba `/u/<usuario>/jogos?aba=conquistas`, selos em `lib/progression.ts` |
| Calendário de lançamentos + push no dia | `lib/releases.ts`, `lib/release-calendar.ts`, `(app)/lancamentos/page.tsx` |
| Card do perfil para incorporar | `u/[username]/card.png/route.tsx`, Configurações → Perfil |
| Exportar dados e excluir conta (LGPD) | `lib/account-data.ts`, `api/conta/exportar/route.ts`, `settings/dados/` |
| Limite de requisições | `lib/rate-limit.ts` (tabela `rate_limits`), regras em `lib/rate-limit-rules.ts` |
| Busca tolerante a erros | `lib/search.ts` (pg_trgm) |
| Sincronização da Steam por atividade | `lib/steam/schedule.ts`, `api/cron/steam-sync`, `.github/workflows/steam-sync.yml` |
| Compartilhar fotos da galeria (Android) | `manifest.ts` (`share_target`), `public/sw.js`, `lib/share-inbox.ts`, `app/compartilhar/route.ts` |
| Miniaturas das fotos | `lib/image-urls.ts` (`-hd.jpg` / `-sd.jpg`), `lib/image-shrink.ts`, `lib/uploads.ts` |
| O que avisar, por tipo de notificação | `lib/notification-prefs.ts`, Configurações → Privacidade e notificações |
| Backup diário criptografado | `.github/workflows/backup.yml` (ver "Backup e restauração") |

---

## 2. Setup

```bash
npm install
cp .env.example .env            # preencha DATABASE_URL/DIRECT_URL, APP_URL, Steam e RAWG (R2 e Resend são opcionais em dev)

# 1ª migration: gere sem aplicar, cole prisma/sql/constraints.sql no fim, aplique
npx prisma migrate dev --name init --create-only
cat prisma/sql/constraints.sql >> prisma/migrations/*_init/migration.sql
npx prisma migrate dev

npm run dev
```

`APP_URL` precisa ser o endereço exato do site (em dev, `http://localhost:3000`): a Steam devolve o login para `APP_URL/api/steam/callback`.

### Deploy (Vercel + Neon + Cloudflare R2)

1. Suba o projeto para um repositório no GitHub (o `.env` fica de fora pelo `.gitignore`).
2. Na Vercel: **Add New → Project**, importe o repositório. O build já é `prisma generate && next build`.
3. Em **Settings → Environment Variables**, cadastre as mesmas variáveis do `.env`, trocando `APP_URL` pelo domínio da Vercel (ex.: `https://gamelog.vercel.app`, sem barra no final).
4. Migrations rodam sozinhas no build de **produção** (`scripts/migrate-production.mjs` → `prisma migrate deploy`), pela `DIRECT_URL` (conexão direta da Neon, host sem `-pooler`). Prévias de PR e o CI não mexem no banco. Se a migration falhar, o build falha e a versão anterior continua no ar.
5. `regions` no `vercel.json` precisa ser a mais próxima do banco (Neon em us-west-2 → `pdx1`).

O "Entrar com Steam" passa a voltar para `APP_URL/api/steam/callback` sozinho, e os cards de compartilhamento usam `APP_URL` como base.

### Login

Login próprio, sem serviço externo: senha com bcrypt em `auth_accounts`, sessão = token aleatório num cookie `httpOnly` (`pg_session`, 30 dias, renovado no uso) cujo hash fica em `sessions`. Sair derruba a sessão no banco; trocar a senha derruba todas. Links de confirmação e de "Esqueci a senha" são tokens de uso único (`auth_tokens`, 48 h e 1 h). Sem `RESEND_API_KEY`/`EMAIL_FROM`, o cadastro entra direto e "Esqueci a senha" fica desligado.

**Entrar com Steam** cria a conta sem e-mail nem senha. Essas contas não podem desvincular a Steam (é o único login delas).

### Crons

`vercel.json` agenda duas rotas (plano Hobby: cada uma 1x por dia). Cadastre `CRON_SECRET` na Vercel; ela envia `Authorization: Bearer <CRON_SECRET>` sozinha.

- `/api/cron/daily` (9h UTC = 6h de Brasília): promoções da wishlist, datas de lançamento conferidas na loja, aviso "lançou hoje", resumo semanal, tempo para zerar (RAWG) e limpeza dos limites de requisição.
- `/api/cron/steam-sync`: sincroniza só quem está "vencido" (`users.steam_next_sync_at`). Quem jogou nas últimas 2 semanas ou abriu o site há pouco: a cada 3 h; normal: 1x por dia; parado há um mês: a cada 3 dias (`src/lib/steam/schedule.ts`).

Para o sync de 3 em 3 horas funcionar no Hobby, o workflow `.github/workflows/steam-sync.yml` chama a mesma rota de hora em hora. Cadastre no GitHub (**Settings → Secrets and variables → Actions**) os segredos `APP_URL` e `CRON_SECRET`. Sem eles o workflow só avisa e não faz nada. (O GitHub pausa workflows agendados em repositórios sem commits por 60 dias.)

### Testes e CI

```bash
npm test            # vitest: regras puras (limites, datas, privacidade da Steam, calendário, fotos…)
npm run typecheck
npm run lint        # ESLint com as regras do Next.js (eslint.config.mjs)
```

`.github/workflows/ci.yml` roda `prisma validate`, tipos, lint, testes e `next build` em todo push e pull request.

### Backup e restauração

`.github/workflows/backup.yml` faz toda noite (03h23 de Brasília) um `pg_dump` (formato custom), **criptografa com AES-256** e guarda como artefato do GitHub por 30 dias. O repositório é público e qualquer um pode baixar artefatos, por isso o arquivo só sai criptografado.

Configure em **Settings → Secrets and variables → Actions**:

- `BACKUP_DATABASE_URL`: conexão **direta** da Neon (Connect → desmarque "Connection pooling").
- `BACKUP_PASSPHRASE`: uma senha longa. **Guarde num gerenciador de senhas: sem ela o backup não abre.**

Para rodar na hora: Actions → Backup do banco → Run workflow.

Restaurar (num banco vazio, por exemplo um branch novo na Neon):

```bash
# 1) Baixe o artefato backup-AAAA-MM-DD em Actions → Backup do banco → (execução) → Artifacts
unzip backup-AAAA-MM-DD.zip
gpg -d poneglyph-AAAA-MM-DD.tar.gz.gpg | tar -xz        # pede a BACKUP_PASSPHRASE

# 2) Restaura
pg_restore --no-owner --no-privileges --exit-on-error --dbname "CONEXAO_DIRETA" poneglyph.dump
```

As fotos ficam no Cloudflare R2 e não entram neste backup (só os links delas).

### Busca (pg_trgm)

A migration `fotos_lancamentos_busca` ativa a extensão `pg_trgm` no schema `extensions` e cria índices GIN em `games.title`, `users.username` e `users.display_name`. A busca de jogos e de pessoas tolera erro de digitação ("zelda breth" acha Breath of the Wild) e mostra "Você quis dizer…?". Se a extensão já estava ativada no schema `public`, a migration move ela para `extensions`.

### E-mails (Resend)

1. Crie uma conta em resend.com e adicione seu domínio (Domains → Add Domain), configurando os registros DNS que ele mostrar. Sem domínio próprio, o Resend só envia para o seu próprio e-mail (bom para testar).
2. Em API Keys, crie uma chave.
3. Na Vercel: `RESEND_API_KEY` = a chave e `EMAIL_FROM` = `Poneglyph.gg <nao-responda@SEU-DOMINIO>`.

Os textos dos e-mails ficam em `src/lib/email.ts`.

### Migração do Supabase (nov/2026)

O site saiu do Supabase (banco, login e fotos) para Neon + login próprio + Cloudflare R2. A cópia é feita uma vez pelo workflow **Migrar do Supabase** (`scripts/migrar-do-supabase.mts`): copia todas as tabelas, cria o login de cada conta com o mesmo hash de senha (ninguém precisa trocar a senha), copia as fotos para o R2, troca as URLs e confere a contagem de linhas. Tudo numa transação: se algo falhar, a Neon fica como estava. Com "simular" marcado, faz tudo e desfaz no fim.

---

## 3. Decisões de arquitetura

**GameLog ≠ LibraryEntry.** Ter o jogo na Steam não é o mesmo que registrá-lo. A sincronização preenche só `library_entries` (horas jogadas), e o usuário decide o que vira log/review. Isso evita inundar o feed com 800 jogos importados de uma vez.

**Um log por (usuário, jogo).** `@@unique([userId, gameId])` mantém o status atual simples. Se depois quiser um "diário" estilo Letterboxd (rejogar e avaliar de novo), crie uma tabela `LogEntry` filha.

**Acesso ao banco.** `constraints.sql` liga RLS em todas as tabelas sem policies: o acesso é só via Prisma no servidor (era essencial no Supabase, que expunha o schema `public` pela Data API).

**Feed = tabela `activities`.** Cada publicação é uma linha: começou a jogar, finalizou, platinou, dropou ou avaliou. Vêm de dois lugares: do formulário na página do jogo (`games/[slug]/_actions/log.ts`) e da sincronização da Steam. Publicações iguais em sequência são agrupadas (`lib/activity.ts → recordActivity`): a Steam publica no máximo uma por jogo e tipo, e mudar de ideia no formulário em menos de 24h atualiza a publicação em vez de criar outra.

**Steam: jogo novo e platina.** A sincronização compara com a anterior: jogo que passou de 0 para mais de 0 minutos vira "começou a jogar" (a primeira sincronização não publica nada, senão seriam centenas de jogos antigos). As conquistas são checadas em até 20 jogos por vez (100 enquanto houver muito jogo nunca conferido), primeiro os jogados nas últimas 2 semanas. 100% das conquistas conta como platina: entra no perfil sempre, e no feed só se a última conquista for dos últimos 14 dias. O layout sincroniza sozinho em segundo plano quando a última sincronização tem mais de 30 min.

**Steam: fila de sincronização em etapas.** "Sincronizar agora", a sincronização automática e o cron não fazem o trabalho na hora: enfileiram um job (`sync_jobs`) e respondem na hora. O job é dividido em tarefas (`sync_tasks`): `LIBRARY` (perfil, jogos, horas, Família Steam) cria `ACHIEVEMENTS` em lotes de 25 jogos (rodam em paralelo), `RARE`, `WISHLIST`, `COVERS` e por fim `FINALIZE`, que só roda quando as outras terminaram. Workers pegam a próxima tarefa livre com `FOR UPDATE SKIP LOCKED` (vários ao mesmo tempo sem pegar a mesma): o próprio request depois da resposta (`after`), `/api/jobs/sync` (acordado pela fila para paralelizar; protegido pelo `CRON_SECRET`) e o cron. Falha passageira da Steam volta para a fila com espera crescente (10 s, 40 s, 2 min 40 s); tarefa de worker que caiu volta sozinha depois de 3 min; uma pessoa tem no máximo um job ativo (índice único parcial). A tela de Contas vinculadas mostra as etapas enquanto roda. Código em `src/lib/jobs/` (fila e regras puras, testadas) e `src/lib/steam/sync.ts` (as etapas).

**Wishlist × Quero jogar.** Wishlist é "quero comprar" (promoções, lançamento); a da Steam é importada na etapa `WISHLIST` (itens com `source = STEAM` saem quando saem de lá; os postos à mão nunca) e o que entra na biblioteca sai da wishlist. "Quero jogar" é a fila do que jogar: o status `BACKLOG` do registro.

**Capas automáticas.** Jogos da Steam usam a capa vertical da biblioteca. Quando ela não existe, `components/game-cover.tsx` troca sozinho para o banner da loja e, por fim, para um placeholder. A busca (`lib/catalog.ts`) usa a loja da Steam (sem chave) e a RAWG se `RAWG_API_KEY` estiver preenchida (cobre jogos de console). O jogo só vira linha em `games` quando alguém abre a página dele.

**Comentários e notificações.** Comentários ficam em `comments` e a página de uma publicação é `/p/[id]`. Curtidas, comentários, novos seguidores e platinas de quem você segue geram linhas em `notifications` (`lib/notifications.ts`); curtir/descurtir repetido não duplica enquanto a notificação não for lida.

**Cards de compartilhamento.** `/u/[username]` e `/p/[id]` têm `opengraph-image.tsx`: o link colado no WhatsApp/Discord/X mostra capa, nota, avatar e números. Toda imagem passa por `lib/og.ts → firstDrawable` antes, porque uma imagem quebrada derruba o card.

**Capas: caminho real.** Jogos novos da Steam guardam as imagens em `/apps/<id>/<hash>/…`, então a URL fixa dá 404. `getStoreAssets` (IStoreBrowseService, sem chave) devolve o caminho real; a sincronização corrige as capas em lote (`resolveSteamCovers`).

**Steam: privacidade.** A Steam responde `200 OK` com `{"response": {}}` quando os "Detalhes dos jogos" estão privados. A action trata `games === undefined` (com `game_count !== 0`) como `STEAM_PRIVATE` e usa `communityvisibilitystate` do `GetPlayerSummaries` para dizer se o bloqueio é o perfil inteiro ou só os detalhes dos jogos. A UI destaca o passo exato a mudar.

**Steam: posse da conta.** A Steam só é vinculada por "Entrar com Steam" (OpenID 2.0). Não existe campo para digitar SteamID ou URL: o usuário faz login no site oficial, a Steam devolve qual é a conta e `lib/steam/openid.ts` confere a resposta (state em cookie, `return_to`, `claimed_id` assinado e `check_authentication` na própria Steam) antes de salvar. A sincronização não recebe SteamID do navegador; usa só o que foi salvo nesse login. Uma conta Steam continua não podendo estar em dois perfis (`steamId @unique`). Trocar de conta apaga a biblioteca importada da anterior.

**RAWG vs IGDB.** RAWG é mais simples (só API key). O IGDB exige credenciais de app da Twitch (client id/secret). O schema guarda `rawgId` e `igdbId`.

**Prisma 7.** A URL do banco saiu do `schema.prisma` para o `prisma.config.ts`, e o client exige driver adapter (`@prisma/adapter-pg`). Migrations usam `DIRECT_URL` (conexão direta da Neon); o app usa o pooler (`DATABASE_URL`, host com `-pooler`).

## 4. Se o site não abrir

1. **Deploy com erro**: Vercel → Deployments. "Instant Rollback" volta para o último que funcionava.
2. **Banco fora**: painel da Neon (o compute "dorme" sem uso e acorda sozinho na primeira consulta, em ~1 s; não pausa o projeto como o Supabase fazia). Confira se a cota do plano grátis não acabou.
3. **CSP bloqueando algo** (tela carrega sem reagir a cliques): cadastre `CSP_MODE=report-only` na Vercel e faça Redeploy; os bloqueios aparecem em /moderacao/erros.
4. **Cron do GitHub com 404**: o segredo `APP_URL` do GitHub tem que ser o endereço que abre o site.
