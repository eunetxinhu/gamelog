// Aplica as migrations do Prisma no build da Vercel, só no deploy de produção.
//
// - Produção (VERCEL_ENV=production): roda `prisma migrate deploy` antes do build.
//   Se falhar, o build falha e a Vercel mantém no ar a versão anterior: o código
//   novo nunca sobe com o banco desatualizado.
// - Prévia de PR, CI e máquina local: não mexe no banco.
//
// `migrate deploy` só aplica o que ainda não foi aplicado (tabela _prisma_migrations),
// então rodar em todo deploy é seguro.
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] pulando: não é deploy de produção (VERCEL_ENV=${process.env.VERCEL_ENV ?? "indefinido"})`);
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  console.error("[migrate] DIRECT_URL não está configurada na Vercel. Cadastre a conexão direta do Supabase (porta 5432) em Settings → Environment Variables.");
  process.exit(1);
}

console.log("[migrate] aplicando migrations pendentes…");
execSync("npx prisma migrate deploy", { stdio: "inherit" });
