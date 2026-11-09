// =============================================================================
//  Migração Supabase → Neon (banco) + Cloudflare R2 (fotos), com o login próprio.
//
//  Roda pelo GitHub Actions ("Migrar do Supabase", botão Run workflow) ou local:
//    npx tsx scripts/migrar-do-supabase.mts [--simular] [--sem-fotos]
//
//  Variáveis:
//    ORIGEM_DB_URL               Supabase, conexão "Session pooler" (porta 5432)
//    ORIGEM_SUPABASE_URL         https://<ref>.supabase.co        (fotos)
//    ORIGEM_SUPABASE_SECRET_KEY  sb_secret_… (Project Settings → API Keys)  (fotos)
//    DESTINO_DB_URL              Neon, conexão direta (sem "-pooler"), com as migrations
//                                já aplicadas (npx prisma migrate deploy)
//    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL  (fotos)
//
//  O que faz, numa transação só no destino (se algo falhar, nada fica pela metade):
//    1. copia todas as tabelas do site, na ordem das chaves estrangeiras
//    2. cria o login próprio de cada conta do Supabase Auth com o MESMO hash de senha
//       (bcrypt): ninguém precisa trocar a senha
//    3. copia as fotos do Supabase Storage para o R2 (mesmos caminhos)
//    4. troca as URLs das fotos em todas as colunas de texto
//    5. confere: mesma quantidade de linhas em cada tabela
//  --simular faz tudo e desfaz no fim (nenhuma foto é enviada).
// =============================================================================
import pg from "pg";
import { AwsClient } from "aws4fetch";

const args = new Set(process.argv.slice(2));
const SIMULAR = args.has("--simular");
const SEM_FOTOS = args.has("--sem-fotos");
const env = (k: string, required = true) => {
  const v = process.env[k]?.trim();
  if (!v && required) throw new Error(`Falta a variável ${k}`);
  return v ?? "";
};

/** Tabelas que não vêm: controle do Prisma, coisas temporárias e o login (feito à parte). */
const SKIP = new Set(["_prisma_migrations", "rate_limits", "sessions", "auth_tokens", "auth_accounts", "sync_jobs", "sync_tasks"]);
const STEAM_EMAIL_DOMAIN = "@steam-login.gamelog.app";
const BUCKET = "profile-media";
const USERNAME = /^[a-z0-9_]{3,30}$/;

const ssl = (url: string) => (/localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false });
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const log = (...a: unknown[]) => console.log(...a);

async function main() {
  const srcUrl = env("ORIGEM_DB_URL");
  const dstUrl = env("DESTINO_DB_URL");
  const src = new pg.Client({ connectionString: srcUrl, ssl: ssl(srcUrl) });
  const dst = new pg.Client({ connectionString: dstUrl, ssl: ssl(dstUrl) });
  await src.connect();
  await dst.connect();
  log(SIMULAR ? "🧪 SIMULAÇÃO: nada fica gravado no fim.\n" : "🚚 Migração de verdade.\n");

  // ---- 0) Destino pronto? ------------------------------------------------------
  const hasUsers = await dst.query(`SELECT to_regclass('public.users') AS t, to_regclass('public.auth_accounts') AS a`);
  if (!hasUsers.rows[0].t || !hasUsers.rows[0].a) throw new Error("O destino não tem as tabelas: rode `npx prisma migrate deploy` nele antes.");
  const already = Number((await dst.query(`SELECT count(*) FROM users`)).rows[0].count);
  if (already > 0 && !args.has("--forcar")) throw new Error(`O destino já tem ${already} usuário(s). Use um banco vazio (ou --forcar para somar).`);

  const tables = await orderedTables(dst);
  const plan = tables.filter((t) => !SKIP.has(t.name));
  const report: { table: string; origem: number; destino: number }[] = [];

  await dst.query("BEGIN");
  try {
    // ---- 1) Dados ------------------------------------------------------------------
    for (const t of plan) {
      const cols = await commonColumns(src, dst, t.name);
      if (!cols.length) {
        log(`  – ${t.name}: não existe na origem, fica vazia`);
        continue;
      }
      const deferred = t.selfRefs.filter((c) => cols.includes(c));
      const n = await copyTable(src, dst, t.name, cols, t.pk, deferred);
      report.push({ table: t.name, origem: n, destino: 0 });
      log(`  ✓ ${t.name}: ${n} linha(s)`);
    }
    await fixSequences(dst);

    // ---- 2) Login -------------------------------------------------------------------
    const auth = await importAuth(src, dst);
    // Perfis criados aqui (cadastro confirmado que nunca entrou) entram na conta de users
    const usersRow = report.find((r) => r.table === "users");
    if (usersRow) usersRow.origem += auth.createdProfiles;
    log(`\n  ✓ login: ${auth.accounts} conta(s) (${auth.withPassword} com senha, ${auth.steamOnly} só Steam), ${auth.createdProfiles} perfil(is) criados para cadastros que nunca tinham entrado, ${auth.skipped} cadastro(s) sem confirmar ignorados`);

    // ---- 3 e 4) Fotos ---------------------------------------------------------------
    if (SEM_FOTOS) log("\n  – fotos: puladas (--sem-fotos)");
    else {
      const photos = await migratePhotos();
      const rewritten = await rewriteUrls(dst, photos.oldOrigin, photos.newPrefix);
      log(`\n  ✓ fotos: ${photos.copied} arquivo(s) ${SIMULAR ? "encontrados (não enviados na simulação)" : "copiados para o R2"}; ${rewritten} valor(es) com URL trocada`);
    }

    // ---- 5) Conferência ------------------------------------------------------------
    let bad = 0;
    for (const r of report) {
      r.destino = Number((await dst.query(`SELECT count(*) FROM ${q(r.table)}`)).rows[0].count);
      if (r.destino !== r.origem) bad++;
    }
    log("\n  Conferência (origem → destino):");
    for (const r of report) log(`    ${r.destino === r.origem ? "✓" : "✗"} ${r.table.padEnd(28)} ${String(r.origem).padStart(7)} → ${r.destino}`);
    const orphan = Number((await dst.query(`SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM auth_accounts a WHERE a.user_id = u.id)`)).rows[0].count);
    if (orphan) log(`    ⚠️ ${orphan} perfil(is) sem login (sem conta no Supabase Auth): só entram se a moderação criar a senha`);
    if (bad) throw new Error(`${bad} tabela(s) com quantidade diferente: nada foi gravado.`);

    await dst.query(SIMULAR ? "ROLLBACK" : "COMMIT");
    log(SIMULAR ? "\n🧪 Simulação ok: desfeito. Rode sem --simular para valer." : "\n✅ Migração concluída.");
  } catch (err) {
    await dst.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await src.end();
    await dst.end();
  }
}

// ---------------------------------------------------------------------------------

type TableInfo = { name: string; pk: string[]; selfRefs: string[] };

/** Tabelas do destino em ordem de dependência (quem é referenciado vem antes). */
async function orderedTables(db: pg.Client): Promise<TableInfo[]> {
  const names = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((r) => r.tablename as string);
  const fks = (
    await db.query(`
      SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
             (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS cols
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`)
  ).rows as { child: string; parent: string; cols: string[] }[];
  const pks = (
    await db.query(`
      SELECT c.conrelid::regclass::text AS t, (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS cols
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype = 'p' AND n.nspname = 'public'`)
  ).rows as { t: string; cols: string[] }[];
  const clean = (s: string) => s.replace(/^"|"$/g, "").replace(/^public\./, "");
  const deps = new Map(names.map((n) => [n, new Set<string>()]));
  const self = new Map(names.map((n) => [n, [] as string[]]));
  for (const f of fks) {
    const child = clean(f.child);
    const parent = clean(f.parent);
    if (child === parent) self.get(child)?.push(...f.cols);
    else deps.get(child)?.add(parent);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (n: string, stack: Set<string>) => {
    if (seen.has(n)) return;
    if (stack.has(n)) throw new Error(`Ciclo de chaves estrangeiras envolvendo ${n}`);
    stack.add(n);
    for (const d of deps.get(n) ?? []) visit(d, stack);
    stack.delete(n);
    seen.add(n);
    out.push(n);
  };
  for (const n of names) visit(n, new Set());
  return out.map((name) => ({ name, pk: pks.find((p) => clean(p.t) === name)?.cols ?? [], selfRefs: self.get(name) ?? [] }));
}

async function columnsOf(db: pg.Client, table: string): Promise<string[]> {
  const r = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
  return r.rows.map((x) => x.column_name as string);
}

async function commonColumns(src: pg.Client, dst: pg.Client, table: string) {
  const s = new Set(await columnsOf(src, table));
  return (await columnsOf(dst, table)).filter((c) => s.has(c));
}

/**
 * Copia em lotes de 1000. Colunas que apontam para a própria tabela (ex.: quem convidou)
 * entram vazias e são preenchidas no fim, para a ordem das linhas não importar.
 */
async function copyTable(src: pg.Client, dst: pg.Client, table: string, cols: string[], pk: string[], deferred: string[]) {
  const list = cols.map(q).join(", ");
  const insertCols = cols.map((c) => (deferred.includes(c) ? `NULL AS ${q(c)}` : q(c))).join(", ");
  const order = (pk.length ? pk : cols.slice(0, 1)).map(q).join(", ");
  let total = 0;
  for (let offset = 0; ; offset += 1000) {
    const rows = (await src.query(`SELECT ${list} FROM ${q(table)} ORDER BY ${order} LIMIT 1000 OFFSET ${offset}`)).rows;
    if (rows.length === 0) break;
    await dst.query(`INSERT INTO ${q(table)} (${list}) SELECT ${insertCols} FROM json_populate_recordset(NULL::${q(table)}, $1::json)`, [JSON.stringify(rows)]);
    total += rows.length;
    if (rows.length < 1000) break;
  }
  // Segunda passada, já com todas as linhas dentro: uma linha pode apontar para outra de um lote seguinte
  if (deferred.length && pk.length) {
    const sel = [...new Set([...pk, ...deferred])].map(q).join(", ");
    const set = deferred.map((c) => `${q(c)} = s.${q(c)}`).join(", ");
    const on = pk.map((c) => `t.${q(c)} = s.${q(c)}`).join(" AND ");
    for (let offset = 0; offset < total; offset += 1000) {
      const rows = (await src.query(`SELECT ${sel} FROM ${q(table)} ORDER BY ${order} LIMIT 1000 OFFSET ${offset}`)).rows;
      await dst.query(`UPDATE ${q(table)} t SET ${set} FROM json_populate_recordset(NULL::${q(table)}, $1::json) s WHERE ${on}`, [JSON.stringify(rows)]);
    }
  }
  return total;
}

/** Sequências (ids numéricos) continuam do maior id copiado. */
async function fixSequences(db: pg.Client) {
  const seqs = (
    await db.query(`
      SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col
      FROM pg_class s JOIN pg_depend d ON d.objid = s.oid JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid JOIN pg_namespace n ON n.oid = s.relnamespace
      WHERE s.relkind = 'S' AND n.nspname = 'public'`)
  ).rows;
  for (const s of seqs) {
    await db.query(`SELECT setval(${`'public.${s.seq}'`}, GREATEST(1, COALESCE((SELECT max(${q(s.col)}) FROM ${q(s.tbl)}), 0)), (SELECT count(*) > 0 FROM ${q(s.tbl)}))`);
  }
}

/** Contas do Supabase Auth → auth_accounts, com o mesmo hash bcrypt. */
async function importAuth(src: pg.Client, dst: pg.Client) {
  const exists = (await src.query(`SELECT to_regclass('auth.users') AS t`)).rows[0].t;
  if (!exists) throw new Error("A origem não tem auth.users (é mesmo o banco do Supabase?)");
  const users = (
    await src.query(`SELECT id::text, email, encrypted_password, email_confirmed_at, raw_user_meta_data AS meta, created_at FROM auth.users WHERE deleted_at IS NULL`)
  ).rows as { id: string; email: string | null; encrypted_password: string | null; email_confirmed_at: Date | null; meta: Record<string, unknown> | null; created_at: Date }[];
  const profiles = new Set((await dst.query(`SELECT id::text FROM users`)).rows.map((r) => r.id as string));
  const takenNames = new Set((await dst.query(`SELECT username FROM users`)).rows.map((r) => r.username as string));
  let accounts = 0;
  let withPassword = 0;
  let steamOnly = 0;
  let createdProfiles = 0;
  let skipped = 0;
  for (const u of users) {
    const steam = Boolean(u.email?.endsWith(STEAM_EMAIL_DOMAIN));
    const email = steam || !u.email ? null : u.email.trim().toLowerCase();
    const hash = u.encrypted_password && /^\$2[aby]\$/.test(u.encrypted_password) ? u.encrypted_password : null;
    if (!profiles.has(u.id)) {
      // Cadastro que confirmou o e-mail mas nunca entrou: o perfil nascia no primeiro acesso
      if (!u.email_confirmed_at || !email) {
        skipped++;
        continue;
      }
      let username = String(u.meta?.username ?? "").toLowerCase();
      if (!USERNAME.test(username) || takenNames.has(username)) username = `player_${u.id.slice(0, 8)}`;
      takenNames.add(username);
      await dst.query(`INSERT INTO users (id, username, created_at, updated_at) VALUES ($1::uuid, $2, $3, now())`, [u.id, username, u.created_at]);
      createdProfiles++;
    }
    await dst.query(
      `INSERT INTO auth_accounts (user_id, email, password_hash, email_verified_at, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, email_verified_at = EXCLUDED.email_verified_at`,
      [u.id, email, hash, email ? (u.email_confirmed_at ?? null) : u.created_at, u.created_at],
    );
    accounts++;
    if (hash) withPassword++;
    if (!email) steamOnly++;
  }
  return { accounts, withPassword, steamOnly, createdProfiles, skipped };
}

/** Supabase Storage → R2 (mesmos caminhos). Devolve os prefixos para trocar as URLs. */
async function migratePhotos() {
  const base = env("ORIGEM_SUPABASE_URL").replace(/\/+$/, "");
  const key = env("ORIGEM_SUPABASE_SECRET_KEY");
  const pub = env("R2_PUBLIC_URL").replace(/\/+$/, "");
  const r2 = new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
  const r2Host = (process.env.R2_ENDPOINT?.replace(/\/+$/, "") || `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`) + `/${env("R2_BUCKET")}`;
  const headers = { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" };

  const list = async (prefix: string) => {
    const out: { name: string; id: string | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers, body: JSON.stringify({ prefix, limit: 1000, offset }) });
      if (!res.ok) throw new Error(`Storage list ${prefix || "/"}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const page = (await res.json()) as { name: string; id: string | null }[];
      out.push(...page);
      if (page.length < 1000) return out;
    }
  };

  const keys: string[] = [];
  for (const folder of (await list("")).filter((e) => e.id === null)) {
    for (const f of await list(folder.name)) if (f.id !== null) keys.push(`${folder.name}/${f.name}`);
  }

  let copied = 0;
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(
      keys.slice(i, i + 8).map(async (k) => {
        if (!SIMULAR) {
          const file = await fetch(`${base}/storage/v1/object/${BUCKET}/${k.split("/").map(encodeURIComponent).join("/")}`, { headers: { authorization: `Bearer ${key}`, apikey: key } });
          if (!file.ok) throw new Error(`Baixar ${k}: ${file.status}`);
          const body = await file.arrayBuffer();
          const put = await r2.fetch(`${r2Host}/${k.split("/").map(encodeURIComponent).join("/")}`, {
            method: "PUT",
            body,
            headers: { "content-type": file.headers.get("content-type") ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
          });
          if (!put.ok) throw new Error(`Enviar ${k} ao R2: ${put.status} ${(await put.text()).slice(0, 200)}`);
        }
        copied++;
      }),
    );
    if (keys.length > 50 && i % 80 === 0) log(`    fotos: ${Math.min(i + 8, keys.length)}/${keys.length}`);
  }
  return { copied, oldOrigin: base, newPrefix: `${pub}/` };
}

/**
 * Troca as URLs públicas do Supabase Storage pelas do R2 em toda coluna de texto, lista de
 * texto e JSON. Reconhece o endereço informado e qualquer <ref>.supabase.co (o mesmo
 * projeto pode aparecer com outro endereço em dados antigos).
 */
async function rewriteUrls(db: pg.Client, oldOrigin: string, newPrefix: string) {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `(${esc(oldOrigin)}|https://[a-z0-9]+\\.supabase\\.co)/storage/v1/object/public/${BUCKET}/`;
  const cols = (
    await db.query(`
      SELECT table_name AS t, column_name AS c, data_type AS type FROM information_schema.columns
      WHERE table_schema = 'public' AND (data_type IN ('text', 'character varying', 'jsonb', 'json') OR (data_type = 'ARRAY' AND udt_name IN ('_text', '_varchar')))`)
  ).rows as { t: string; c: string; type: string }[];
  let total = 0;
  for (const { t, c, type } of cols) {
    let sql: string;
    if (type === "ARRAY") sql = `UPDATE ${q(t)} SET ${q(c)} = (SELECT array_agg(regexp_replace(x, $1, $2, 'g') ORDER BY i) FROM unnest(${q(c)}) WITH ORDINALITY u(x, i)) WHERE array_to_string(${q(c)}, ' ') ~ $1`;
    else if (type === "jsonb" || type === "json") sql = `UPDATE ${q(t)} SET ${q(c)} = regexp_replace(${q(c)}::text, $1, $2, 'g')::${type} WHERE ${q(c)}::text ~ $1`;
    else sql = `UPDATE ${q(t)} SET ${q(c)} = regexp_replace(${q(c)}, $1, $2, 'g') WHERE ${q(c)} ~ $1`;
    const res = await db.query(sql, [pattern, newPrefix]);
    total += res.rowCount ?? 0;
  }
  return total;
}

main().catch((err) => {
  console.error("\n❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
