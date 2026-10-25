import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: a URL do banco sai do schema.prisma e vem para cá.
// Use a conexão DIRETA (porta 5432) para migrations; o app em runtime usa a
// URL do pooler (DATABASE_URL, porta 6543) via driver adapter em src/lib/prisma.ts.
// process.env (e não env()) para `prisma generate` funcionar em CI sem banco.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
