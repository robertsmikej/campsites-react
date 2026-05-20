import { getKv } from "@/lib/cloudflare";
import type { RecentOpening } from "@/app/api/admin/openings/recent/route";

const KV_KEY = "notifier:recent";

function devSyntheticOpenings(): RecentOpening[] {
    const now = Date.now();
    const h = 60 * 60 * 1000;
    return [
        {
            signature: "232448:5:2026-07-04:2026-07-07:3",
            campgroundId: "232448",
            campgroundName: "Loon Lake",
            siteId: "5",
            siteName: "005",
            from: "2026-07-04",
            to: "2026-07-07",
            nights: 3,
            detectedAt: new Date(now - 12 * 60 * 1000).toISOString(), // 12m ago
        },
        {
            signature: "232449:12:2026-07-10:2026-07-13:3",
            campgroundId: "232449",
            campgroundName: "Fallen Leaf Lake",
            siteId: "12",
            siteName: "012",
            from: "2026-07-10",
            to: "2026-07-13",
            nights: 3,
            detectedAt: new Date(now - 1.5 * h).toISOString(), // 1.5h ago
        },
        {
            signature: "232450:7:2026-08-15:2026-08-18:3",
            campgroundId: "232450",
            campgroundName: "Wrights Lake",
            siteId: "7",
            siteName: "007",
            from: "2026-08-15",
            to: "2026-08-18",
            nights: 3,
            detectedAt: new Date(now - 3.2 * h).toISOString(), // 3.2h ago
        },
        {
            signature: "232451:22:2026-07-19:2026-07-21:2",
            campgroundId: "232451",
            campgroundName: "Ice House Reservoir",
            siteId: "22",
            siteName: "022",
            from: "2026-07-19",
            to: "2026-07-21",
            nights: 2,
            detectedAt: new Date(now - 4.8 * h).toISOString(), // 4.8h ago
        },
        {
            signature: "232452:3:2026-09-05:2026-09-08:3",
            campgroundId: "232452",
            campgroundName: "Big Meadows",
            siteId: "3",
            siteName: "003",
            from: "2026-09-05",
            to: "2026-09-08",
            nights: 3,
            detectedAt: new Date(now - 5.9 * h).toISOString(), // 5.9h ago
        },
    ];
}

export async function GET(): Promise<Response> {
    const stored = (await getKv().get(KV_KEY, "json")) as RecentOpening[] | null;

    let body: RecentOpening[];
    if (stored && stored.length > 0) {
        body = stored;
    } else if (process.env.NODE_ENV !== "production") {
        body = devSyntheticOpenings();
    } else {
        body = [];
    }

    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=30, s-maxage=30",
        },
    });
}
