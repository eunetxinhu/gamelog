import type { Metadata } from "next";
import { ForgotPasswordForm } from "../_components/password-forms";
import { BrandStage } from "@/components/brand-stage";

export const metadata: Metadata = { title: "Esqueci a senha" };

export default function ForgotPasswordPage() {
  return (
    <BrandStage>
      <ForgotPasswordForm />
    </BrandStage>
  );
}
