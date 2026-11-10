import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { tokenIsValid } from "@/lib/auth/accounts";
import { prisma } from "@/lib/prisma";
import { ResetPasswordForm } from "../_components/password-forms";
import { BrandStage } from "@/components/brand-stage";

export const metadata: Metadata = { title: "Criar nova senha" };

type Props = { searchParams: Promise<{ token?: string }> };

/**
 * Aberta pelo link do e-mail (?token=…), que vale 1 hora e uma vez só, ou logado
 * (trocar a senha). Link vencido volta ao login com o aviso.
 */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (token) {
    if (!(await tokenIsValid(token, "RESET_PASSWORD"))) redirect("/login?error=reset");
    return (
      <BrandStage>
        <ResetPasswordForm email={null} token={token} />
      </BrandStage>
    );
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login?error=reset");
  const account = await prisma.authAccount.findUnique({ where: { userId: user.id }, select: { email: true } });
  return (
    <BrandStage>
      <ResetPasswordForm email={account?.email ?? null} token={null} />
    </BrandStage>
  );
}
