"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { deleteList } from "../_actions/lists";

/**
 * Apagar lista: mesma janela de confirmação do resto do site. A ação roda dentro da
 * janela (com erro visível se falhar) e só depois saímos da página, com `replace`
 * para o "voltar" do navegador não cair numa lista que não existe mais.
 */
export function DeleteListButton({ listId, title, disabled, compact }: { listId: string; title: string; disabled?: boolean; compact?: boolean }) {
  const router = useRouter();
  const ask = useConfirm();

  async function onClick() {
    const done = await ask({
      title: `Apagar a lista “${title}”?`,
      description: "Os jogos continuam no site, mas a lista, as curtidas e os comentários dela somem. Não dá para desfazer.",
      confirmLabel: "Apagar lista",
      action: () => deleteList(listId),
    });
    if (done) {
      router.replace("/listas");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        compact
          ? "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 transition hover:bg-red-950/40 disabled:opacity-60"
          : "inline-flex items-center gap-2 rounded-lg border border-red-900/60 px-4 py-2.5 text-sm text-red-300 transition hover:bg-red-950/40 disabled:opacity-60"
      }
    >
      <Trash2 className="size-4" aria-hidden /> Apagar lista
    </button>
  );
}
