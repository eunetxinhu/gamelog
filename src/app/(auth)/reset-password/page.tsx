import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "../_components/password-forms";

export const metadata: Metadata = { title: "Criar nova senha · GameLog" };

/**
 * Aberta pelo link do e-mail: o /auth/callback troca o código por uma sessão e
 * manda para cá. Sem sessão (link expirado ou aberto em outro navegador), volta ao login.
 */
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=reset");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <ResetPasswordForm email={data.user.email ?? null} />
    </main>
  );
}
