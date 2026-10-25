// Redução de imagem no navegador antes do upload (só no client).

/** Lado maior depois de reduzir. */
export const MAX_SIDE = 1600;
/** Lado maior da miniatura (feed, clubes, conversas). */
export const THUMB_SIDE = 960;

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

/**
 * Versão grande + miniatura de uma vez (decodifica a foto uma vez só).
 * Devolve os dois como File prontos para o FormData do upload.
 */
export async function imageVariants(file: File): Promise<{ full: File; thumb: File }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [full, thumb] = await Promise.all([render(bitmap, MAX_SIDE, 0.85), render(bitmap, THUMB_SIDE, 0.8)]);
    return { full: new File([full], "foto.jpg", { type: "image/jpeg" }), thumb: new File([thumb], "foto-sd.jpg", { type: "image/jpeg" }) };
  } finally {
    bitmap.close();
  }
}

function render(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", quality));
}
