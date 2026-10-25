"use server";

import { getCurrentUser } from "@/lib/auth";
import { uploadImage, type UploadResult } from "@/lib/uploads";

/** Imagem anexada a publicação, post de clube ou mensagem. Devolve a URL para usar no envio. */
export async function uploadMedia(formData: FormData): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };
  const kind = formData.get("kind");
  if (kind !== "post" && kind !== "club" && kind !== "dm") return { ok: false, message: "Arquivo inválido." };
  return uploadImage(user.id, kind, formData.get("file"));
}
