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
            console.error(`[recgov] ${facilityId} ${month}: HTTP ${response.status}`);
            return null;
        }
        return (await response.json()) as RawMonthResult;
    } catch (error) {
        console.error(`[recgov] ${facilityId} ${month}: ${(error as Error).message}`);
        return null;
    }
}
