// Ganchos do Next.js: todo erro de servidor (página, rota, Server Action) passa aqui.
// Em produção vai para o registro de erros (src/lib/error-log.ts), que avisa a moderação.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const err = error as Error & { digest?: string };
  // "notFound()" e "redirect()" usam erros internos: não são falhas de verdade
  if (err.digest?.startsWith("NEXT_")) return;
  const { recordError } = await import("@/lib/error-log");
  await recordError({ kind: "server", message: err.message || String(error), stack: err.stack, path: request.path, method: request.method });
};
