import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { getUserCampgrounds } from "@/lib/user-campgrounds";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import {
    WorkerKvAdapter,
    fetchMonthWithCache,
    processCampgroundResults,
    getAllDatesInRange,
    type AvailabilitySnapshot,
    type SnapshotCampground,
} from "@/lib/recgov";
import type { Campground, GlobalSettings } from "@/types/campground";

const DEFAULT_CONFIG_KEY = "config:campgrounds";

interface SourceConfig {
    campgrounds: { "recreation.gov"?: Campground[] };
    globalSettings: GlobalSettings;
}

function monthsBetween(startDate: string, endDate: string): string[] {
    const months: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, "0");
        months.push(`${y}-${m}`);
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

async function buildSnapshot(
    config: SourceConfig,
    adapter: WorkerKvAdapter,
): Promise<AvailabilitySnapshot> {
    const baseSettings = {
        stayLengths: config.globalSettings.stayLengths,
        validStartDays: config.globalSettings.validStartDays,
    };
    const campgrounds = config.campgrounds["recreation.gov"] ?? [];
    const results: SnapshotCampground[] = [];

    for (const cg of campgrounds) {
        if (cg.enabled === false) continue;
        const start = cg.dates?.startDate;
        const end = cg.dates?.endDate;
        if (!start || !end) continue;

        const months = monthsBetween(start, end);
        const rawResults = await Promise.all(
            months.map((month) => fetchMonthWithCache(cg.id, month, adapter)),
        );

        const allDates = getAllDatesInRange(start, end);
        const effectiveSettings = {
            ...baseSettings,
            ...(cg.stayLengths ? { stayLengths: cg.stayLengths } : {}),
            ...(cg.validStartDays ? { validStartDays: cg.validStartDays } : {}),
        };

        const sites = processCampgroundResults(rawResults, allDates, effectiveSettings);
        const totalSitesCount = Object.keys(sites).length;
        const sitesWithMatches: typeof sites = {};
        for (const [siteId, site] of Object.entries(sites)) {
            if (site.matches && site.matches.length > 0) {
                sitesWithMatches[siteId] = site;
            }
        }
        results.push({
            campgroundId: cg.id,
            campgroundName: cg.name,
            campgroundArea: cg.area ?? "",
            campgroundDescription: cg.description ?? "",
            sites: sitesWithMatches,
            totalSitesCount,
        });
    }

    return { updatedAt: new Date().toISOString(), campgrounds: results };
}

async function getHandler(request: Request): Promise<Response> {
    const kv = getKv();
    const adapter = new WorkerKvAdapter(kv);
    const session = await readSession(request);

    if (session) {
        const cached = await adapter.getSnapshot(session.email);
        if (cached) return withCors(jsonResponse(cached));

        const userRecord = await getUserCampgrounds(session.email);
        const config: SourceConfig = {
            campgrounds: userRecord?.campgrounds ?? { "recreation.gov": [] },
            globalSettings: (userRecord?.globalSettings ?? {
                stayLengths: [2, 3, 4, 5],
                validStartDays: ["Friday", "Saturday"],
            }) as GlobalSettings,
        };
        const snapshot = await buildSnapshot(config, adapter);
        await adapter.putSnapshot(session.email, snapshot);
        return withCors(jsonResponse(snapshot));
    }

    // Anonymous: use curated default config; no snapshot persistence.
    const defaultConfig = (await kv.get(DEFAULT_CONFIG_KEY, "json")) as SourceConfig | null;
    if (!defaultConfig) {
        return withCors(jsonResponse({ updatedAt: new Date().toISOString(), campgrounds: [] }));
    }
    const snapshot = await buildSnapshot(defaultConfig, adapter);
    return withCors(jsonResponse(snapshot));
}

export const GET = withErrorLogging(getHandler, "GET /api/availability");
