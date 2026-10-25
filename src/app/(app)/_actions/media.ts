"use server";

import { getCurrentUser } from "@/lib/auth";
import { uploadImage, type UploadResult } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";

/** Imagem anexada a publicação, post de clube ou mensagem. Devolve a URL para usar no envio. */
export async function uploadMedia(formData: FormData): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Faça login de novo." };
  if (user.bannedAt) return { ok: false, message: "Sua conta está suspensa." };
  const kind = formData.get("kind");
  if (kind !== "post" && kind !== "club" && kind !== "dm") return { ok: false, message: "Arquivo inválido." };
  const limit = await rateLimit("upload", user.id);
  if (!limit.ok) return { ok: false, message: limit.message };
  return uploadImage(user.id, kind, formData.get("file"), formData.get("thumb"));
}
