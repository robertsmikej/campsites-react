import { getKv } from "./cloudflare";
import { defaultDates } from "./default-dates";
import type { Campground } from "@/types/campground";

export interface ArchivedCampground extends Campground {
    removedAt: string; // ISO timestamp of when it left the watchlist
}

export interface CampgroundArchive {
    campgrounds: ArchivedCampground[];
}

/** Newest-first cap — beyond this, the oldest removals fall off. */
export const ARCHIVE_CAP = 50;

function key(email: string): string {
    return `user:${email}:campground-archive`;
}

function sortNewestFirst(entries: ArchivedCampground[]): ArchivedCampground[] {
    return [...entries].sort((a, b) => b.removedAt.localeCompare(a.removedAt));
}

export async function getCampgroundArchive(email: string): Promise<CampgroundArchive> {
    const stored = (await getKv().get(key(email), "json")) as CampgroundArchive | null;
    return { campgrounds: sortNewestFirst(stored?.campgrounds ?? []) };
}

/** Upsert removed campgrounds (full config as-it-was) into the user's archive. */
export async function archiveRemovedCampgrounds(
    email: string,
    removed: Campground[],
    removedAt: string,
): Promise<void> {
    if (removed.length === 0) return;
    const existing = await getCampgroundArchive(email);
    const removedIds = new Set(removed.map((c) => c.id));
    const kept = existing.campgrounds.filter((c) => !removedIds.has(c.id));
    const added: ArchivedCampground[] = removed.map((c) => ({ ...c, removedAt }));
    const campgrounds = sortNewestFirst([...kept, ...added]).slice(0, ARCHIVE_CAP);
    await getKv().put(key(email), JSON.stringify({ campgrounds }));
}

/** Build a re-addable Campground from an archive entry: full prior config,
 *  fresh season-capped dates, Normal check tier (a stale "high" must not
 *  silently eat the 3-slot cap), enabled. */
export function restoreCampground(entry: ArchivedCampground): Campground {
    const { removedAt: _removedAt, checkPriority: _checkPriority, ...rest } = entry;
    return {
        ...rest,
        dates: defaultDates(),
        enabled: true,
    };
}
