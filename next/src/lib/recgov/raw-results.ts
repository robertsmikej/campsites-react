// Distinguishes "the rec.gov fetch failed / returned nothing" from "the fetch
// succeeded and the campground genuinely has zero matching sites".
//
// fetchMonth returns null on HTTP error or network failure, and
// fetchMonthWithCache leaves the raw cache untouched on a null result. So a
// campground whose every month came back null produced NO usable data this
// cycle — callers should preserve last-good data (or omit the campground)
// rather than emitting a misleading totalSitesCount: 0 ("Site-level data not
// loaded yet") into the snapshot.
export function fetchProducedNoData(rawResults: ReadonlyArray<unknown> | null | undefined): boolean {
    if (!rawResults || rawResults.length === 0) return true;
    return rawResults.every((r) => r == null);
}
