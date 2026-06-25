import { REC_GOV_USER_AGENT, type RawMonthResult } from "./types";

export const REC_GOV_MONTH_URL = "https://www.recreation.gov/api/camps/availability/campground";

// Fetch a single month of availability data for a campground.
// Returns null on HTTP error or network failure.
export async function fetchMonth(facilityId: string, month: string): Promise<RawMonthResult | null> {
    const url = `${REC_GOV_MONTH_URL}/${facilityId}/month?start_date=${month}-01T00%3A00%3A00.000Z`;
    try {
        const response = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": REC_GOV_USER_AGENT },
        });
        if (!response.ok) {
            // 429/403 are the rate-limit / IP-block signals — tag them distinctly so a
            // block is greppable + alertable (e.g. a Cloudflare log alert on
            // "recgov-block") instead of masquerading as a quiet "no openings".
            const tag = response.status === 429 || response.status === 403 ? "recgov-block" : "recgov";
            console.error(`[${tag}] ${facilityId} ${month}: HTTP ${response.status}`);
            return null;
        }
        return (await response.json()) as RawMonthResult;
    } catch (error) {
        console.error(`[recgov] ${facilityId} ${month}: ${(error as Error).message}`);
        return null;
    }
}
