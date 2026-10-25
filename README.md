# GameLog — rede social de registro e avaliação de jogos

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Auth + Postgres) · Prisma 7 · RAWG/IGDB · Steam Web API + Steam OpenID

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
   │  │  └─ auth/callback/route.ts          troca o code do Supabase por sessão
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
   │  ├─ auth.ts                            ✅ getCurrentUser() (cria perfil no 1º login)
   │  ├─ supabase/server.ts                 ✅
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
cp .env.example .env            # preencha Supabase, APP_URL, Steam e RAWG

# 1ª migration: gere sem aplicar, cole prisma/sql/constraints.sql no fim, aplique
npx prisma migrate dev --name init --create-only
cat prisma/sql/constraints.sql >> prisma/migrations/*_init/migration.sql
npx prisma migrate dev

npm run dev
```

`APP_URL` precisa ser o endereço exato do site (em dev, `http://localhost:3000`): a Steam devolve o login para `APP_URL/api/steam/callback`.

### Deploy (Vercel + Supabase)

1. Suba o projeto para um repositório no GitHub (o `.env` fica de fora pelo `.gitignore`).
2. Na Vercel: **Add New → Project**, importe o repositório. O build já é `prisma generate && next build`.
3. Em **Settings → Environment Variables**, cadastre as mesmas variáveis do `.env`, trocando `APP_URL` pelo domínio da Vercel (ex.: `https://gamelog.vercel.app`, sem barra no final).
4. No Supabase, em **Authentication → URL Configuration**: Site URL = o domínio da Vercel e, em Redirect URLs, `https://SEU-DOMINIO/auth/callback`.
5. Migrations rodam sozinhas no build de **produção** (`scripts/migrate-production.mjs` → `prisma migrate deploy`). Para isso, cadastre `DIRECT_URL` na Vercel (conexão direta do Supabase, porta 5432). Prévias de PR e o CI não mexem no banco. Se a migration falhar, o build falha e a versão anterior continua no ar.
   - Sem acesso a uma máquina, também dá para colar o `migration.sql` no SQL Editor do Supabase, desde que a migration seja registrada em `_prisma_migrations` (senão o próximo deploy tenta aplicar de novo).

O "Entrar com Steam" passa a voltar para `APP_URL/api/steam/callback` sozinho, e os cards de compartilhamento usam `APP_URL` como base.

### Login com Steam

Precisa da chave secreta do Supabase em `SUPABASE_SECRET_KEY` (Project Settings → API Keys → Secret keys → `sb_secret_…`), no `.env` e na Vercel. Sem ela o botão "Entrar com Steam" some do login e a Steam só pode ser vinculada a uma conta de e-mail. Contas criadas pela Steam usam um e-mail interno (`steam-<id>@steam-login.gamelog.app`) e não podem desvincular a Steam (é o único login delas).

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

No plano grátis o Supabase não faz backup diário. `.github/workflows/backup.yml` faz toda noite (03h23 de Brasília) o dump recomendado pelo Supabase (roles, schema e dados), **criptografa com AES-256** e guarda como artefato do GitHub por 30 dias. O repositório é público e qualquer um pode baixar artefatos, por isso o arquivo só sai criptografado.

Configure em **Settings → Secrets and variables → Actions**:

- `BACKUP_DATABASE_URL`: conexão **Session pooler** do Supabase (Project Settings → Database → Connection string → Session pooler, porta 5432). Os runners do GitHub não têm IPv6, então a conexão direta não funciona.
- `BACKUP_PASSPHRASE`: uma senha longa. **Guarde num gerenciador de senhas: sem ela o backup não abre.**

Para rodar na hora: Actions → Backup do banco → Run workflow.

Restaurar (num projeto Supabase novo ou no mesmo, com o banco vazio):

```bash
# 1) Baixe o artefato backup-AAAA-MM-DD em Actions → Backup do banco → (execução) → Artifacts
unzip backup-AAAA-MM-DD.zip
gpg -d gamelog-AAAA-MM-DD.tar.gz.gpg | tar -xz        # pede a BACKUP_PASSPHRASE

# 2) Restaura (comando da documentação do Supabase)
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "CONEXAO_SESSION_POOLER"
```

As fotos ficam no Supabase Storage e não entram neste backup (só os links delas).

### Busca (pg_trgm)

A migration `fotos_lancamentos_busca` ativa a extensão `pg_trgm` no schema `extensions` (padrão do Supabase) e cria índices GIN em `games.title`, `users.username` e `users.display_name`. A busca de jogos e de pessoas tolera erro de digitação ("zelda breth" acha Breath of the Wild) e mostra "Você quis dizer…?". Se a extensão já estava ativada no schema `public`, a migration move ela para `extensions`.

### E-mails (Resend + Supabase)

O SMTP padrão do Supabase manda poucos e-mails por hora; com mais usuários, cadastro e "Esqueci a senha" travam.

1. Crie uma conta em resend.com e adicione seu domínio (Domains → Add Domain), configurando os registros DNS que ele mostrar. Sem domínio próprio, o Resend só envia para o seu próprio e-mail (bom para testar).
2. Em API Keys, crie uma chave.
3. No Supabase: Authentication → Emails → SMTP Settings → Enable custom SMTP:
   - Host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a chave do Resend
   - Sender email `nao-responda@SEU-DOMINIO`, sender name `GameLog`
4. Em Authentication → Rate Limits, aumente "Rate limit for sending emails".
5. Em Authentication → Emails → Templates, troque os textos:

**Confirm signup** — assunto: `Confirme sua conta no GameLog`

```html
<h2>Bem-vindo ao GameLog!</h2>
<p>Falta só um passo: confirme seu e-mail para ativar sua conta.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar minha conta</a></p>
<p>Se você não criou uma conta, pode ignorar este e-mail.</p>
```

**Reset password** — assunto: `Crie uma nova senha no GameLog`

```html
<h2>Esqueceu a senha?</h2>
<p>Clique no link abaixo para criar uma nova senha. Abra no mesmo navegador em que você pediu.</p>
<p><a href="{{ .ConfirmationURL }}">Criar nova senha</a></p>
<p>Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>
```

---

## 3. Decisões de arquitetura

**GameLog ≠ LibraryEntry.** Ter o jogo na Steam não é o mesmo que registrá-lo. A sincronização preenche só `library_entries` (horas jogadas), e o usuário decide o que vira log/review. Isso evita inundar o feed com 800 jogos importados de uma vez.

**Um log por (usuário, jogo).** `@@unique([userId, gameId])` mantém o status atual simples. Se depois quiser um "diário" estilo Letterboxd (rejogar e avaliar de novo), crie uma tabela `LogEntry` filha.

**Acesso ao banco.** Como o Supabase expõe o schema `public` pela Data API, `constraints.sql` liga RLS em todas as tabelas sem policies: o acesso é só via Prisma no servidor.

**Feed = tabela `activities`.** Cada publicação é uma linha: começou a jogar, finalizou, platinou, dropou ou avaliou. Vêm de dois lugares: do formulário na página do jogo (`games/[slug]/_actions/log.ts`) e da sincronização da Steam. Publicações iguais em sequência são agrupadas (`lib/activity.ts → recordActivity`): a Steam publica no máximo uma por jogo e tipo, e mudar de ideia no formulário em menos de 24h atualiza a publicação em vez de criar outra.

**Steam: jogo novo e platina.** A sincronização compara com a anterior: jogo que passou de 0 para mais de 0 minutos vira "começou a jogar" (a primeira sincronização não publica nada, senão seriam centenas de jogos antigos). As conquistas são checadas em até 20 jogos por vez, primeiro os jogados nas últimas 2 semanas. 100% das conquistas conta como platina: entra no perfil sempre, e no feed só se a última conquista for dos últimos 14 dias. O layout sincroniza sozinho em segundo plano quando a última sincronização tem mais de 30 min.

**Capas automáticas.** Jogos da Steam usam a capa vertical da biblioteca. Quando ela não existe, `components/game-cover.tsx` troca sozinho para o banner da loja e, por fim, para um placeholder. A busca (`lib/catalog.ts`) usa a loja da Steam (sem chave) e a RAWG se `RAWG_API_KEY` estiver preenchida (cobre jogos de console). O jogo só vira linha em `games` quando alguém abre a página dele.

**Comentários e notificações.** Comentários ficam em `comments` e a página de uma publicação é `/p/[id]`. Curtidas, comentários, novos seguidores e platinas de quem você segue geram linhas em `notifications` (`lib/notifications.ts`); curtir/descurtir repetido não duplica enquanto a notificação não for lida.

**Cards de compartilhamento.** `/u/[username]` e `/p/[id]` têm `opengraph-image.tsx`: o link colado no WhatsApp/Discord/X mostra capa, nota, avatar e números. Toda imagem passa por `lib/og.ts → firstDrawable` antes, porque uma imagem quebrada derruba o card.

**Capas: caminho real.** Jogos novos da Steam guardam as imagens em `/apps/<id>/<hash>/…`, então a URL fixa dá 404. `getStoreAssets` (IStoreBrowseService, sem chave) devolve o caminho real; a sincronização corrige as capas em lote (`resolveSteamCovers`).

**Steam: privacidade.** A Steam responde `200 OK` com `{"response": {}}` quando os "Detalhes dos jogos" estão privados. A action trata `games === undefined` (com `game_count !== 0`) como `STEAM_PRIVATE` e usa `communityvisibilitystate` do `GetPlayerSummaries` para dizer se o bloqueio é o perfil inteiro ou só os detalhes dos jogos. A UI destaca o passo exato a mudar.

**Steam: posse da conta.** A Steam só é vinculada por "Entrar com Steam" (OpenID 2.0). Não existe campo para digitar SteamID ou URL: o usuário faz login no site oficial, a Steam devolve qual é a conta e `lib/steam/openid.ts` confere a resposta (state em cookie, `return_to`, `claimed_id` assinado e `check_authentication` na própria Steam) antes de salvar. A sincronização não recebe SteamID do navegador; usa só o que foi salvo nesse login. Uma conta Steam continua não podendo estar em dois perfis (`steamId @unique`). Trocar de conta apaga a biblioteca importada da anterior.

**RAWG vs IGDB.** RAWG é mais simples (só API key). O IGDB exige credenciais de app da Twitch (client id/secret). O schema guarda `rawgId` e `igdbId`.

**Prisma 7.** A URL do banco saiu do `schema.prisma` para o `prisma.config.ts`, e o client exige driver adapter (`@prisma/adapter-pg`). Migrations usam `DIRECT_URL` (porta 5432); o app usa o pooler (`DATABASE_URL`, porta 6543).
