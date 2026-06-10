// Default watch window for a newly added campground, shared by every add path
// (site-config dialog and the dashboard/homepage lookup).
export function defaultDates(now: Date = new Date()): { startDate: string; endDate: string } {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const rollingEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0);
    // Season ends Sep 30 — never default into October so the notifier doesn't
    // burn a rec.gov month-fetch on dates nobody camps. After Sep 30 the season
    // end rolls to next year (where the rolling window is shorter anyway).
    const seasonEndYear = now.getMonth() + 1 > 9 ? now.getFullYear() + 1 : now.getFullYear();
    const seasonEnd = new Date(seasonEndYear, 8, 30);
    const end = rollingEnd < seasonEnd ? rollingEnd : seasonEnd;
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { startDate: fmt(start), endDate: fmt(end) };
}
