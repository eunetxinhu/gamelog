// Service worker do GameLog: página amigável sem internet + notificações push.
// Nada de cache das páginas (o conteúdo é dinâmico e por usuário).
const CACHE = "gamelog-offline-v1";
const OFFLINE_URL = "/offline";
// Fotos recebidas pelo "Compartilhar" do celular (lidas em src/lib/share-inbox.ts)
const SHARE_CACHE = "gamelog-share";
const SHARE_PATH = "/compartilhar";
const MAX_SHARED = 4;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

// ---- Compartilhar (Web Share Target) ------------------------------------------
// O Android manda as fotos num POST para /compartilhar. Guardamos no cache e abrimos o
// post de fotos do feed, que pega os arquivos de lá (o servidor nunca recebe esse POST).
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("fotos").filter((f) => f instanceof File && f.type.startsWith("image/")).slice(0, MAX_SHARED);
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
    await Promise.all(
      files.map((f, i) =>
        cache.put(
          `${SHARE_PATH}/arquivo/${i}`,
          new Response(f, { headers: { "Content-Type": f.type, "X-File-Name": encodeURIComponent(f.name || `foto-${i + 1}.jpg`) } }),
        ),
      ),
    );
    const text = ["title", "text", "url"].map((k) => form.get(k)).filter((v) => typeof v === "string" && v.trim()).join(" ").slice(0, 500);
    const target = new URL("/feed", self.location.origin);
    target.searchParams.set("postar", "1");
    target.searchParams.set("compartilhado", String(files.length));
    if (text) target.searchParams.set("texto", text);
    return Response.redirect(target.href, 303);
  } catch {
    return Response.redirect(new URL("/feed?postar=1", self.location.origin).href, 303);
  }
}

// ---- Push ---------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "GameLog", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "GameLog", {
      body: data.body || "",
      icon: data.icon || "/icons/192",
      badge: "/icons/192",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/notifications" },
    }),
  );
});

// Toque na notificação: foca uma aba aberta do GameLog (navegando para o link) ou abre uma nova
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => t.url.startsWith(self.location.origin));
      if (tab) return tab.navigate(url).then((t) => (t || tab).focus());
      return self.clients.openWindow(url);
    }),
  );
});
