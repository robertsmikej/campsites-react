// Push-only service worker. Intentionally no offline caching — the app is SSR
// on Cloudflare and we don't want a cache layer fighting it.
self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {};
    }
    const title = data.title || "CampWatch";
    const options = {
        body: data.body || "A site you're watching just opened.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/app" },
        tag: data.tag,
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/app";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            for (const c of clients) {
                if (c.url.includes(url) && "focus" in c) return c.focus();
            }
            return self.clients.openWindow(url);
        }),
    );
});
