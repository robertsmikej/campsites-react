// Fired on `window` after the signed-in user's watchlist is saved (campground
// added/removed/edited). The dashboard's availability data listens for this so
// it refetches instead of showing a stale snapshot until a manual page reload.
export const WATCHLIST_CHANGED_EVENT = "campwatch:watchlist-changed";
