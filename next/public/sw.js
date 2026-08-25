// Push-only service worker. Intentionally no offline caching — the app is SSR
// on Cloudflare and we don't want a cache layer fighting it.

// Keep in sync with AVAILABILITY_UPDATED_MESSAGE in src/lib/events.ts (a service
// worker can't import app modules).
const AVAILABILITY_UPDATED_MESSAGE = "campwatch:availability-updated";

// Tell any open dashboard tabs to refetch availability, so a watched-site
// opening shows up live instead of waiting for the next poll.
async function notifyOpenClients() {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
        client.postMessage({ type: AVAILABILITY_UPDATED_MESSAGE });
    }
}

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
    event.waitUntil(Promise.all([self.registration.showNotification(title, options), notifyOpenClients()]));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    // Always open the CampWatch dashboard. External URLs (recreation.gov)
    // can't be opened safely in iOS standalone mode (blanks the PWA), and
    // the availability data is already refreshed via notifyOpenClients(),
    // so the opening shows up in the timeline.
    const url = "/app";

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            for (const c of clients) {
                if (new URL(c.url).host === self.location.host && "focus" in c) return c.focus();
            }
            return self.clients.openWindow(url);
        }),
    );
});
