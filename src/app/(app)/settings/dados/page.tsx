import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hasSupabaseAdmin } from "@/lib/supabase/admin";
import { DeleteAccountForm } from "./_components/delete-account-form";

export const metadata: Metadata = { title: "Seus dados · GameLog" };

/** LGPD: baixar uma cópia dos dados e excluir a conta. */
export default async function DataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings/dados");

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Section
        title="Baixar seus dados"
        description="Um arquivo JSON com tudo o que o GameLog guarda sobre você: perfil, Steam vinculada, registros, biblioteca, publicações, comentários, mensagens, clubes e mais."
      >
        <a
          href="/api/conta/exportar"
          download
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
        >
          <Download className="size-4" aria-hidden /> Baixar meus dados
        </a>
        <p className="mt-2 text-xs text-zinc-500">Até 3 vezes por dia.</p>
      </Section>

      <Section title="Excluir conta" description="Apaga sua conta e tudo o que você publicou." danger>
        <DeleteAccountForm username={user.username} available={hasSupabaseAdmin()} />
      </Section>

      <p className="text-center text-xs text-zinc-600">
        Seus direitos sobre os dados pessoais seguem a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
      </p>
    </main>
  );
}

function Section({ title, description, danger, children }: { title: string; description: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${danger ? "border-red-900/60 bg-red-950/20" : "border-zinc-800 bg-zinc-900/60"}`}>
      <h2 className={`text-lg font-semibold ${danger ? "text-red-200" : "text-zinc-50"}`}>{title}</h2>
      <p className="text-sm text-zinc-400">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
