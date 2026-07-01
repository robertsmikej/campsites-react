// Fired on `window` after the signed-in user's watchlist is saved (campground
// added/removed/edited). The dashboard's availability data listens for this so
// it refetches instead of showing a stale snapshot until a manual page reload.
export const WATCHLIST_CHANGED_EVENT = "campwatch:watchlist-changed";

// postMessage type the push service worker sends to open clients when a watched
// site opens, so the dashboard refetches live instead of waiting for the next
// poll. Keep this string in sync with public/sw.js (it can't import this module).
export const AVAILABILITY_UPDATED_MESSAGE = "campwatch:availability-updated";

// How often the dashboard refetches availability while the tab is visible. The
// notifier's 5-min sweep is the real freshness floor for normal-tier data, so a
// sub-minute poll would mostly re-serve identical snapshots; 90s stays fresh
// without hammering the endpoint.
export const AVAILABILITY_POLL_INTERVAL_MS = 90_000;
