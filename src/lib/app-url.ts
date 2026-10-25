import "server-only";

/** Origem pública do site (APP_URL). Usada em redirects e nos retornos da Steam e do Supabase. */
export function appUrl() {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL não configurada");
  return new URL(url).origin;
}
