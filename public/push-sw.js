// Service Worker dedicado a notificações push.
// Não faz cache de app shell — apenas push + clique.
self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: "Phonee", body: event.data?.text?.() ?? "" }; }
  const title = data.title || "Phonee";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/app" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
  // Sinaliza para a UI mostrar a "bolinha" vermelha no sino do menu.
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      try { client.postMessage({ type: "phonee:new_notification" }); } catch (_) {}
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) { await client.navigate(target); }
          return;
        }
      } catch (_) {}
    }
    await self.clients.openWindow(target);
  })());
});