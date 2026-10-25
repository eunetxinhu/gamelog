import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Login com Steam só funciona com a chave secreta do Supabase configurada. */
export function hasSupabaseAdmin() {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

/**
 * Cliente com a chave secreta (sb_secret_…): ignora RLS e acessa a API de admin do Auth.
 * Só no servidor, nunca em Client Components.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY não configurada");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
