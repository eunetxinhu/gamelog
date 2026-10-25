import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Regras recomendadas do Next.js (React, hooks, Core Web Vitals) + TypeScript.
// Roda no CI (.github/workflows/ci.yml) e com `npm run lint`.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gerado pelo `prisma generate`
    "src/generated/**",
    // Service worker: roda fora do bundle, com as globais do worker
    "public/**",
  ]),
]);
