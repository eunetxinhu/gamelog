import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { AuthForm } from "../_components/auth-form";
import { safeNext } from "../_actions/types";
import { BrandStage } from "@/components/brand-stage";

export const metadata: Metadata = { title: "Entrar" };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getCurrentUser()) redirect(next);

  // Vêm do /auth/callback (link de confirmação) e do /reset-password (link de nova senha)
  const NOTICES: Record<string, string> = {
    confirm: "O link de confirmação é inválido ou expirou. Entre ou cadastre-se de novo.",
    reset: "O link para criar uma nova senha é inválido ou expirou. Peça outro em “Esqueci a senha” e abra-o neste navegador.",
    steam: "Não conseguimos entrar com a Steam agora. Tente de novo ou entre com e-mail.",
    limite: "Muitas tentativas de entrar com a Steam a partir desta rede. Aguarde um pouco e tente de novo.",
    "conta-excluida": "Sua conta foi excluída. Obrigado por ter jogado com a gente.",
  };
  const notice = error ? NOTICES[error] : undefined;

  return (
    <BrandStage>
      <AuthForm mode="login" next={next} notice={notice} steamLogin={hasSupabaseAdmin()} />
    </BrandStage>
  );
}
