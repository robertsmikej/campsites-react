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
    const raw = (event.notification.data && event.notification.data.url) || "/app";

    // External URLs (recreation.gov, etc.) must go through a pass-through
    // page so the PWA window stays on CampWatch. In iOS standalone mode,
    // clients.openWindow() with a cross-origin URL navigates the PWA window
    // itself instead of opening Safari, which blanks the app permanently.
    const isExternal = raw.startsWith("http") && !raw.includes(self.location.host);
    const url = isExternal ? "/go?url=" + encodeURIComponent(raw) : raw;

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            for (const c of clients) {
                // For external URLs, find any CampWatch client to navigate;
                // for internal URLs, look for one already on that page.
                const match = isExternal
                    ? new URL(c.url).host === self.location.host
                    : c.url.includes(raw);
                if (match && "focus" in c) {
                    if (isExternal) c.navigate(url);
                    return c.focus();
                }
            }
            return self.clients.openWindow(url);
        }),
    );
});
