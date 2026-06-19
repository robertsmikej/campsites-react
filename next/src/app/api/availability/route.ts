import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { getUserCampgrounds } from "@/lib/user-campgrounds";
import { getDefaultConfig } from "@/lib/default-config";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import {
    WorkerKvAdapter,
    fetchMonthWithCache,
    fetchProducedNoData,
    processCampgroundResults,
    getAllDatesInRange,
    type AvailabilitySnapshot,
    type SnapshotCampground,
} from "@/lib/recgov";
import type { Campground, GlobalSettings } from "@/types/campground";
import { findAdjacentGroups, type AdjacencySite } from "@/lib/adjacent-groups";
import { getSiteDetailsCached, kvNamespaceLike } from "@/lib/site-details-cache";

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

async function buildSnapshot(config: SourceConfig, adapter: WorkerKvAdapter): Promise<AvailabilitySnapshot> {
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

        // Fully past months can't produce bookable openings — skip their fetches.
        // The month containing today always stays. Mirrors the notifier's plan clamp.
        const nowMonth = new Date().toISOString().slice(0, 7);
        const months = monthsBetween(start, end).filter((m) => m >= nowMonth);
        if (months.length === 0) continue;
        const rawResults = await Promise.all(
            months.map((month) => fetchMonthWithCache(cg.id, month, adapter)),
        );

        // rec.gov returned nothing for every month (error / network failure).
        // Omit the campground rather than caching a misleading totalSitesCount: 0
        // ("Site-level data not loaded yet"); a later rebuild fills it in once the
        // fetch succeeds.
        if (fetchProducedNoData(rawResults)) continue;

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
        let adjacentGroups;
        if (cg.adjacencyAnchor) {
            const details = await getSiteDetailsCached(cg.id, kvNamespaceLike(getKv()));
            const sitesForGraph: AdjacencySite[] = details.map((d) => ({
                id: d.id,
                lat: d.lat,
                lng: d.lng,
                ...(d.loop ? { loop: d.loop } : {}),
            }));
            // Build availableNightsByName from rawResults (keyed by siteName/site number).
            // Cannot use the processed `sites` map because processCampgroundResults deletes
            // the `dates` field after computing matches.
            const availableNightsByName: Record<string, string[]> = {};
            for (const raw of rawResults) {
                if (!raw?.campsites) continue;
                for (const siteData of Object.values(raw.campsites)) {
                    const name = siteData.site;
                    if (!availableNightsByName[name]) availableNightsByName[name] = [];
                    const validDates = Object.entries(siteData.availabilities)
                        .filter(([, status]) => status === "Available")
                        .map(([date]) => date.split("T")[0] ?? "")
                        .filter((date) => allDates.includes(date));
                    (availableNightsByName[name] as string[]).push(...validDates);
                }
            }
            const groups = findAdjacentGroups({
                campgroundId: cg.id,
                sites: sitesForGraph,
                availableNightsByName,
                tiers: { favorites: cg.sites?.favorites ?? [], worthwhile: cg.sites?.worthwhile ?? [] },
                settings: {
                    stayLengths: effectiveSettings.stayLengths,
                    validStartDays: effectiveSettings.validStartDays,
                    blackoutDates: config.globalSettings.blackoutDates,
                },
                anchorScope: cg.adjacencyAnchor,
            });
            if (groups.length > 0) adjacentGroups = groups;
        }

        results.push({
            ...cg,
            siteAvailability: sitesWithMatches,
            totalSitesCount,
            ...(adjacentGroups ? { adjacentGroups } : {}),
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

    // Anonymous: use the curator's watchlist as the default; no snapshot persistence.
    const defaultConfig = await getDefaultConfig();
    const snapshot = await buildSnapshot(defaultConfig, adapter);
    return withCors(jsonResponse(snapshot));
}

export const GET = withErrorLogging(getHandler, "GET /api/availability");
