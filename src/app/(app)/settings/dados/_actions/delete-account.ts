"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { deleteAccount } from "@/lib/account-data";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";

export type DeleteAccountState = { error?: string };

/** Exclui a conta logada. Precisa digitar o @usuario para confirmar. */
export async function deleteMyAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Faça login de novo." };

  const typed = String(formData.get("confirm") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (typed !== user.username) return { error: `Digite @${user.username} para confirmar.` };

  const limit = await rateLimit("account-delete", user.id);
  if (!limit.ok) return { error: limit.message };

  const result = await deleteAccount(user.id);
  if (!result.ok) return { error: result.message };

  // As sessões foram apagadas junto com a conta: tira o cookie que sobrou no navegador
  (await cookies()).delete(SESSION_COOKIE);

  redirect("/login?error=conta-excluida");
}
