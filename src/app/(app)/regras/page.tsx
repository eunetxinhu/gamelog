import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Regras da comunidade", description: `Como manter o ${SITE_NAME} um lugar bom para todo mundo jogar junto.` };

const RULES = [
  {
    title: "Respeito acima de tudo",
    body: "Discorde de notas e opiniões à vontade, mas critique o jogo, não a pessoa. Nada de ofensas, assédio, discurso de ódio ou perseguição: isso leva à suspensão da conta.",
  },
  {
    title: "Marque os spoilers",
    body: "Ao escrever sobre história, final ou segredos, marque a opção de spoiler. Ninguém merece descobrir o plot twist no feed.",
  },
  {
    title: "Seja você mesmo",
    body: "Uma conta por pessoa. Não se passe por outra pessoa, criador ou empresa, e não use o site para golpes, venda de contas ou links suspeitos.",
  },
  {
    title: "Conteúdo de verdade",
    body: "Fotos e reviews devem ser de jogos. Nada de conteúdo sexual explícito, violência real, dados pessoais de terceiros ou pirataria.",
  },
  {
    title: "Sem spam",
    body: "Nada de flood de publicações, comentários repetidos, correntes ou divulgação em massa. Indicar seu canal de vez em quando, tudo bem; viver disso, não.",
  },
  {
    title: "Conquistas honestas",
    body: "Platinas, horas e conquistas vêm da Steam. Não marque como platinado o que você não platinou: o ranking e os selos só têm graça se forem reais.",
  },
  {
    title: "Viu algo errado? Denuncie",
    body: "Use o botão de denúncia (🏳) em publicações, comentários, listas e perfis. A moderação analisa cada caso. Você também pode bloquear quem quiser.",
  },
];

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold text-zinc-50 sm:text-3xl">Regras da comunidade</h1>
      <p className="mt-2 text-sm text-zinc-400">
        O {SITE_NAME} é um lugar para registrar, discutir e celebrar jogos com outras pessoas. Estas regras valem para tudo o que é publicado aqui:
        publicações, fotos, reviews, comentários, listas, clubes, mensagens e perfis.
      </p>
      <ol className="mt-6 space-y-3">
        {RULES.map((r, i) => (
          <li key={r.title} className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-300">{i + 1}</span>
            <div>
              <h2 className="font-semibold text-zinc-100">{r.title}</h2>
              <p className="mt-1 text-sm text-zinc-300">{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-zinc-500">
        Quem desrespeitar as regras pode ter o conteúdo removido ou a conta suspensa. Dúvidas sobre seus dados? Veja{" "}
        <Link href="/settings/dados" className="text-brand-400 hover:underline">
          Seus dados
        </Link>
        .
      </p>
    </main>
  );
}
