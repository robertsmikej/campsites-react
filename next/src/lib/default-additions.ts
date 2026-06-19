import type { Campground } from "@/types/campground";

/**
 * Campgrounds the curator has added to the default *since the user last saw it*
 * and that the user doesn't already have. This is the basis for the dashboard's
 * "recently added" nudge.
 *
 * A campground qualifies when its `addedAt` is strictly newer than `seenAt` and
 * its id isn't already on the user's list. Entries without `addedAt` are
 * pre-existing curator picks and never count as new. A missing `seenAt` is
 * treated as the epoch, so any dated addition counts.
 *
 * Order follows the default list.
 */
export function recentlyAddedFromDefault(
    defaultCampgrounds: Campground[],
    userCampgrounds: Campground[],
    seenAt: string | null | undefined,
): Campground[] {
    const since = seenAt ?? "";
    const userIds = new Set(userCampgrounds.map((c) => c.id).filter(Boolean));
    return defaultCampgrounds.filter((c) => !!c.addedAt && c.addedAt > since && !userIds.has(c.id));
}
