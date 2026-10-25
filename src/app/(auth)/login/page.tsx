import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "../_components/auth-form";
import { safeNext } from "../_actions/types";

export const metadata: Metadata = { title: "Entrar · GameLog" };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getCurrentUser()) redirect(next);

  // ?error=confirm vem do /auth/callback quando o link de confirmação falha
  const notice = error === "confirm" ? "O link de confirmação é inválido ou expirou. Entre ou cadastre-se de novo." : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthForm mode="login" next={next} notice={notice} />
    </main>
  );
}
