import type { Campground, NotifyScope } from "@/types/campground";

const DEFAULT_FALLBACK: NotifyScope = "worthwhile";

export function resolveNotifyScope(
    campground: Pick<Campground, "notifyScope" | "notifyAll">,
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
