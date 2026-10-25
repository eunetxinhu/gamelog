import type { Metadata } from "next";
import { ForgotPasswordForm } from "../_components/password-forms";

export const metadata: Metadata = { title: "Esqueci a senha · GameLog" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <ForgotPasswordForm />
    </main>
  );
}
