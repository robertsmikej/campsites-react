// Mirror of next/src/lib/notify-scope.ts. Notifier can't import from next/, so
// the logic lives in both places. Keep them in sync.

export type NotifyScope = "favorites" | "worthwhile" | "all";

const DEFAULT_FALLBACK: NotifyScope = "worthwhile";

export function resolveNotifyScope(
    campground: { notifyScope?: NotifyScope; notifyAll?: boolean },
    userDefault: NotifyScope | undefined,
): NotifyScope {
    if (campground.notifyScope) return campground.notifyScope;
    if (campground.notifyAll) return "all";
    return userDefault ?? DEFAULT_FALLBACK;
}

export function matchPassesScope(matchGroup: string, scope: NotifyScope): boolean {
    if (scope === "all") return true;
    if (scope === "worthwhile") return matchGroup === "favorites" || matchGroup === "worthwhile";
    return matchGroup === "favorites";
}
