// Fotos que chegaram pelo "Compartilhar" do celular (Web Share Target).
// O service worker (public/sw.js) recebe o POST em /compartilhar, guarda os arquivos
// neste cache e manda para /feed?postar=1&compartilhado=N. O post de fotos lê daqui.

/** Mesmo nome usado em public/sw.js */
// Nome interno (do tempo em que o site se chamava GameLog); trocar esvaziaria o cache de quem já instalou.
export const SHARE_CACHE = "gamelog-share";

/** Lê os arquivos compartilhados e esvazia a caixa (cada compartilhamento é usado uma vez). */
export async function takeSharedFiles(): Promise<File[]> {
  if (!("caches" in window)) return [];
  const cache = await caches.open(SHARE_CACHE);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const req of [...keys].sort((a, b) => a.url.localeCompare(b.url))) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get("X-File-Name") ?? "foto.jpg");
    files.push(new File([blob], name, { type: blob.type || res.headers.get("Content-Type") || "image/jpeg" }));
  }
  await Promise.all(keys.map((k) => cache.delete(k)));
  return files;
}
