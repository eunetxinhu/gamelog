import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "../_components/password-forms";
import { BrandStage } from "@/components/brand-stage";

export const metadata: Metadata = { title: "Criar nova senha" };

/**
 * Aberta pelo link do e-mail: o /auth/callback troca o código por uma sessão e
 * manda para cá. Sem sessão (link expirado ou aberto em outro navegador), volta ao login.
 */
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=reset");

  return (
    <BrandStage>
      <ResetPasswordForm email={data.user.email ?? null} />
    </BrandStage>
  );
}
