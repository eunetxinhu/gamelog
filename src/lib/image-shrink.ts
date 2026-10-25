// Redução de imagem no navegador antes do upload (só no client).

/** Lado maior depois de reduzir. */
export const MAX_SIDE = 1600;

/**
 * Reduz para no máximo MAX_SIDE e converte para JPEG. Fotos de celular (12 MP, HEIC
 * convertido pelo navegador) caem para ~300 KB, bem abaixo do limite de 4 MB.
 * `createImageBitmap` já respeita a rotação EXIF nos navegadores atuais.
 */
export async function shrinkImage(file: File, maxSide = MAX_SIDE): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85));
}
