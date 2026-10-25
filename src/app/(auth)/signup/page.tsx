import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { AuthForm } from "../_components/auth-form";
import { safeNext } from "../_actions/types";
import { cleanRef } from "@/lib/referral";
import { BrandStage } from "@/components/brand-stage";

export const metadata: Metadata = { title: "Criar conta" };

type Props = { searchParams: Promise<{ next?: string; ref?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const query = await searchParams;
  // Conta nova começa pelos "Primeiros passos" (a não ser que tenha vindo de outro lugar)
  const next = query.next ? safeNext(query.next) : "/bem-vindo";
  if (await getCurrentUser()) redirect(next);

  return (
    <BrandStage>
      <AuthForm mode="signup" next={next} steamLogin={hasSupabaseAdmin()} inviteRef={cleanRef(query.ref)} />
    </BrandStage>
  );
}
