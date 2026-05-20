// Campsite Availability Notifier — per-user rewire (Phase 5)
// Pulls per-user campground lists from /api/admin/notification-targets,
// deduplicates recreation.gov fetches, and emails each user about their own matches.
// Designed to run as a GitHub Actions scheduled workflow.

import { fetchMonth, processCampgroundResults, getAllDatesInRange } from './lib/fetch-availability.mjs';
import { findNewMatches, generateSignature } from './lib/diff.mjs';
import { formatEmail, sendEmail } from './lib/email.mjs';

const DELAY_BETWEEN_FETCHES_MS = 500;

// Non-curator users don't receive an email about a new match until this many
// milliseconds after the global first-sighting. Curators are notified immediately.
const LEAD_TIME_MS = 15 * 60 * 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Eligibility ---

function isEligible(target, now, forceEmail) {
    if (forceEmail) return true;
    if (!target.notifications?.enabled) return false;
    const last = target.lastNotifiedAt ? new Date(target.lastNotifiedAt) : null;
    if (!last) return true;
    const elapsedMin = (now.getTime() - last.getTime()) / 60000;
    return elapsedMin >= target.notifications.frequencyMinutes;
}

// --- Dedup fetch plan ---

function monthsBetween(startIso, endIso) {
    const start = new Date(startIso + 'T00:00:00Z');
    const end = new Date(endIso + 'T00:00:00Z');
    const months = new Set();
    const cur = new Date(start);
    while (cur <= end) {
        const m = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`;
        months.add(m);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return [...months];
}

function buildDedupedFetchPlan(targets) {
    // campgroundId → Set<"YYYY-MM">
    const ranges = new Map();
    for (const target of targets) {
        for (const c of target.campgrounds['recreation.gov'] ?? []) {
            if (c.enabled === false) continue;
            const start = c.dates?.startDate;
            const end = c.dates?.endDate;
            if (!start || !end) continue;
            const months = monthsBetween(start, end);
            if (!ranges.has(c.id)) ranges.set(c.id, new Set());
            for (const m of months) ranges.get(c.id).add(m);
        }
    }
    const plan = [];
    for (const [campgroundId, monthSet] of ranges) {
        for (const month of monthSet) plan.push({ campgroundId, month });
    }
    return plan;
}

// --- Fetch deduped: returns { [campgroundId]: [apiResult, ...] } across all months ---

async function fetchDeduped(plan) {
    // Group months by campgroundId so we can log nicely
    const byCampground = new Map();
    for (const { campgroundId, month } of plan) {
        if (!byCampground.has(campgroundId)) byCampground.set(campgroundId, []);
        byCampground.get(campgroundId).push(month);
    }
    for (const [id, months] of byCampground) {
        console.log(`[Fetch] Campground ${id}: ${months.length} month(s) to fetch`);
    }

    const rawByCampground = {};
    for (let i = 0; i < plan.length; i++) {
        const { campgroundId, month } = plan[i];
        const result = await fetchMonth(campgroundId, month);
        if (!rawByCampground[campgroundId]) rawByCampground[campgroundId] = [];
        rawByCampground[campgroundId].push(result);
        if (i < plan.length - 1) {
            await delay(DELAY_BETWEEN_FETCHES_MS);
        }
    }
    return rawByCampground;
}

// --- Compute matches for a single user from pre-fetched raw API data ---
// Returns matches in the same shape as findNewMatches (without diff).

function computeMatchesForUser(target, rawByCampground) {
    const globalSettings = target.globalSettings ?? {};
    const defaultSettings = {
        stayLengths: [2, 3, 4, 5],
        validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    };
    const baseSettings = {
        stayLengths: globalSettings.stayLengths ?? defaultSettings.stayLengths,
        validStartDays: globalSettings.validStartDays ?? defaultSettings.validStartDays,
    };

    // Build synthetic fetchCampground-style result objects so we can reuse findNewMatches.
    const syntheticResults = [];

    for (const c of target.campgrounds['recreation.gov'] ?? []) {
        if (c.enabled === false) continue;
        const start = c.dates?.startDate;
        const end = c.dates?.endDate;
        if (!start || !end) continue;

        const rawApiResults = rawByCampground[c.id];
        if (!rawApiResults) continue;

        const allDates = getAllDatesInRange(start, end);
        const effectiveSettings = {
            ...baseSettings,
            ...(c.stayLengths ? { stayLengths: c.stayLengths } : {}),
            ...(c.validStartDays ? { validStartDays: c.validStartDays } : {}),
        };

        const siteAvailability = processCampgroundResults(rawApiResults, allDates, effectiveSettings);

        syntheticResults.push({
            campgroundId: c.id,
            campgroundName: c.name,
            campgroundArea: c.area ?? '',
            campgroundDescription: c.description ?? '',
            sites: siteAvailability,
        });
    }

    // Build a "siteConfigurations" list in the shape findNewMatches expects.
    const siteConfigurations = (target.campgrounds['recreation.gov'] ?? []).map((c) => ({
        id: c.id,
        sites: {
            favorites: c.sites?.favorites ?? [],
            worthwhile: c.sites?.worthwhile ?? [],
        },
        notifyAll: c.notifyAll ?? false,
    }));

    // findNewMatches with an empty previousSignatures set = all current matches.
    const allMatches = findNewMatches(syntheticResults, new Set(), siteConfigurations);

    // Apply the notifyAll / favorites filter (mirrors the old logic).
    const notifyAllIds = new Set(siteConfigurations.filter((c) => c.notifyAll).map((c) => c.id));
    const filtered = allMatches.filter(
        (m) => m.group === 'favorites' || m.group === 'worthwhile' || notifyAllIds.has(m.campgroundId)
    );

    return filtered;
}

// --- Diff per user ---

// signatureForMatch wraps diff.mjs's generateSignature to accept the match object shape
// that findNewMatches returns: { campgroundId, siteId, match: { from, to, nights } }
function signatureForMatch(m) {
    return generateSignature(m.campgroundId, m.siteId, m.match);
}

function diffPerUser(matches, priorState) {
    const priorSignatures = new Set(priorState?.signatures ?? []);
    const newMatches = matches.filter((m) => !priorSignatures.has(signatureForMatch(m)));
    const nextState = { signatures: matches.map(signatureForMatch) };
    return { newMatches, nextState };
}

// --- Send email to a single user ---

async function sendEmailToUser({ user, matches, resendApiKey, siteUrl, apiSecret }) {
    const { subject, html, unsubscribeLink } = formatEmail(matches, {
        unsubscribeUrl: `${process.env.SUBSCRIBER_API_URL}/api/unsubscribe`,
        email: user.email,
        apiSecret,
        siteUrl,
    });
    console.log(`[Email] Sending to ${user.email}: "${subject}"`);
    await sendEmail(user.email, subject, html, resendApiKey, unsubscribeLink);
}

// --- First-seen map helpers ---

async function fetchFirstSeenMap(subscriberApiUrl, subscriberApiSecret) {
    const res = await fetch(`${subscriberApiUrl}/api/admin/first-seen`, {
        headers: { Authorization: `Bearer ${subscriberApiSecret}` },
    });
    if (!res.ok) {
        console.error(`[Warn] first-seen GET returned ${res.status} — starting with empty map`);
        return {};
    }
    return res.json();
}

async function putFirstSeenMap(subscriberApiUrl, subscriberApiSecret, map) {
    const res = await fetch(`${subscriberApiUrl}/api/admin/first-seen`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${subscriberApiSecret}`,
        },
        body: JSON.stringify({ map }),
    });
    if (!res.ok) {
        console.error(`[Warn] first-seen PUT returned ${res.status}`);
    }
}

// --- Main ---

async function main() {
    const subscriberApiUrl = process.env.SUBSCRIBER_API_URL;
    const subscriberApiSecret = process.env.SUBSCRIBER_API_SECRET;
    const resendApiKey = process.env.RESEND_API_KEY;
    const siteUrl = process.env.SITE_URL || '';
    const forceEmail = process.env.FORCE_EMAIL === 'true';
    const now = new Date();

    if (!subscriberApiUrl || !subscriberApiSecret) {
        console.error('[Error] Missing SUBSCRIBER_API_URL or SUBSCRIBER_API_SECRET');
        process.exit(1);
    }
    if (!resendApiKey) {
        console.error('[Error] Missing RESEND_API_KEY');
        process.exit(1);
    }

    // 1. Fetch targets from the new endpoint.
    const targetsResponse = await fetch(`${subscriberApiUrl}/api/admin/notification-targets`, {
        headers: { Authorization: `Bearer ${subscriberApiSecret}` },
    });
    if (!targetsResponse.ok) {
        console.error(`[Error] notification-targets returned ${targetsResponse.status}`);
        process.exit(1);
    }
    const { targets } = await targetsResponse.json();
    console.log(`[Targets] ${targets.length} users with non-empty campground lists`);

    // 2. Filter by enabled + frequency.
    const eligible = targets.filter((t) => isEligible(t, now, forceEmail));
    console.log(`[Eligible] ${eligible.length} users due for a check this cycle`);
    if (eligible.length === 0) {
        console.log('[Done] Nothing to do');
        return;
    }

    // 3. Build dedup'd fetch plan.
    const plan = buildDedupedFetchPlan(eligible);
    console.log(`[Plan] ${plan.length} unique (campground, month) fetches`);

    // 4. Fetch each (campgroundId, month) from rec.gov ONCE; accumulate raw API results per campground.
    const rawByCampground = await fetchDeduped(plan);

    // 5. Fetch the existing global first-seen map.
    const existingFirstSeenMap = await fetchFirstSeenMap(subscriberApiUrl, subscriberApiSecret);

    // 6. Compute all currently-visible match signatures across all eligible users.
    //    For each signature: record first-seen timestamp if not already present; keep existing if so.
    //    Only retain signatures still visible this cycle (stale ones drop naturally).
    //
    //    Also build a global enrichment map (sig → enriched fields) so step 9.5 can
    //    populate the recent-openings log without re-walking per-user data.
    const newFirstSeenMap = {};
    const globalMatchesBySig = {};
    for (const target of eligible) {
        const userMatches = computeMatchesForUser(target, rawByCampground);
        for (const m of userMatches) {
            const sig = signatureForMatch(m);
            if (!newFirstSeenMap[sig]) {
                newFirstSeenMap[sig] = existingFirstSeenMap[sig] ?? now.toISOString();
            }
            if (!globalMatchesBySig[sig]) {
                globalMatchesBySig[sig] = {
                    campgroundId: m.campgroundId,
                    campgroundName: m.campgroundName,
                    siteId: m.siteId,
                    siteName: m.siteName,
                    from: m.match.from,
                    to: m.match.to,
                    nights: m.match.nights,
                };
            }
        }
    }

    // 7. Per user: apply lead-time filter (non-curators only), diff against their state.
    const updates = [];
    // Tracks latency (ms from first-seen to email-sent) for each match emailed this cycle.
    const sentLatenciesMs = [];
    for (const target of eligible) {
        const userMatches = computeMatchesForUser(target, rawByCampground);
        const isCurator = (target.roles ?? []).includes('curator');

        // Apply curator lead-time: non-curators only see matches whose global first-sighting
        // is at least LEAD_TIME_MS in the past. This filter runs BEFORE the diff so that a
        // match that hasn't elapsed lead-time doesn't silently land in the user's prior state.
        const visible = isCurator
            ? userMatches
            : userMatches.filter((m) => {
                  const sig = signatureForMatch(m);
                  const firstSeen = newFirstSeenMap[sig];
                  if (!firstSeen) return false; // defensive; shouldn't happen
                  return now.getTime() - new Date(firstSeen).getTime() >= LEAD_TIME_MS;
              });

        const priorState = target.notifierState ?? null;
        const isFirstRun = priorState === null;
        const { newMatches, nextState } = diffPerUser(visible, priorState);

        if (isFirstRun && !forceEmail) {
            console.log(`[${target.email}] first run — seeding state, no email`);
            updates.push({ email: target.email, state: nextState, lastNotifiedAt: now.toISOString() });
            continue;
        }

        if (newMatches.length === 0) {
            console.log(`[${target.email}] 0 new matches`);
            updates.push({ email: target.email, state: nextState });
            continue;
        }

        console.log(`[${target.email}] ${newMatches.length} new match(es) — sending email`);
        try {
            const sentAtMs = Date.now();
            await sendEmailToUser({ user: target, matches: newMatches, resendApiKey, siteUrl, apiSecret: subscriberApiSecret });
            // Record latency for each match in this email.
            for (const m of newMatches) {
                const sig = signatureForMatch(m);
                const firstSeenIso = newFirstSeenMap[sig];
                if (firstSeenIso) {
                    sentLatenciesMs.push(sentAtMs - new Date(firstSeenIso).getTime());
                }
            }
            updates.push({ email: target.email, state: nextState, lastNotifiedAt: now.toISOString() });
        } catch (err) {
            console.error(`[${target.email}] email send failed: ${err.message}`);
            updates.push({ email: target.email, state: nextState });
        }
    }

    // 8. Push state back to the API.
    const stateResponse = await fetch(`${subscriberApiUrl}/api/admin/notifier-state`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${subscriberApiSecret}`,
        },
        body: JSON.stringify({ updates }),
    });
    if (!stateResponse.ok) {
        console.error(`[Warn] notifier-state PUT returned ${stateResponse.status}`);
    } else {
        const result = await stateResponse.json();
        console.log(`[Done] Updated state for ${result.updated} user(s)`);
    }

    // 9. Persist the updated first-seen map (pruned to only currently-visible signatures).
    await putFirstSeenMap(subscriberApiUrl, subscriberApiSecret, newFirstSeenMap);

    // 9.5: Maintain recent-openings log.
    // Fetch the prior log from the public endpoint (no auth needed, falls back to []).
    const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
    const recentResp = await fetch(`${subscriberApiUrl}/api/openings/recent`).catch(() => null);
    const priorRecent = recentResp && recentResp.ok ? await recentResp.json() : [];

    // Prune entries older than 24h.
    const recent = priorRecent.filter(
        (r) => r.detectedAt && Date.now() - new Date(r.detectedAt).getTime() < RECENT_WINDOW_MS,
    );
    const existingSigs = new Set(recent.map((r) => r.signature));

    // Signatures whose first-seen timestamp was recorded this cycle are new.
    // We use a 60s window to catch timestamps stamped during the current run;
    // signatures that were already in existingFirstSeenMap predate this cycle.
    const cycleStartMs = now.getTime() - 60 * 1000;
    for (const [sig, firstSeen] of Object.entries(newFirstSeenMap)) {
        if (existingSigs.has(sig)) continue;
        if (new Date(firstSeen).getTime() < cycleStartMs) continue;
        const enriched = globalMatchesBySig[sig];
        if (!enriched) continue;
        recent.push({ signature: sig, ...enriched, detectedAt: firstSeen });
    }

    // Sort descending by detectedAt; keep at most 200 entries.
    recent.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    const trimmedRecent = recent.slice(0, 200);

    try {
        const recentPutResp = await fetch(`${subscriberApiUrl}/api/admin/openings/recent`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${subscriberApiSecret}`,
            },
            body: JSON.stringify(trimmedRecent),
        });
        if (!recentPutResp.ok) {
            console.error(`[Warn] /api/admin/openings/recent PUT returned ${recentPutResp.status}`);
        } else {
            console.log(`[Recent] ${trimmedRecent.length} entries in log (${recent.length - (priorRecent.filter((r) => r.detectedAt && Date.now() - new Date(r.detectedAt).getTime() < RECENT_WINDOW_MS).length)} new this cycle)`);
        }
    } catch (err) {
        console.error(`[Warn] /api/admin/openings/recent PUT failed: ${err.message}`);
    }

    // 10. Compute and PUT stats.
    const todayKeyUtc = now.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

    // Campgrounds tracked: unique campground IDs across ALL targets (not just eligible),
    // matching only enabled entries. Gives a stable "currently watched" count each cycle.
    const trackedIds = new Set();
    for (const t of targets) {
        for (const c of t.campgrounds['recreation.gov'] ?? []) {
            if (c.enabled === false) continue;
            if (c.id) trackedIds.add(c.id);
        }
    }

    // Read prior stats so we can accumulate the daily counter and the latency window.
    let priorStats = null;
    try {
        const priorStatsResponse = await fetch(`${subscriberApiUrl}/api/stats`);
        if (priorStatsResponse.ok) {
            priorStats = await priorStatsResponse.json();
        }
    } catch (err) {
        console.error(`[Warn] Could not fetch prior stats: ${err.message}`);
    }

    // Daily counter: reset to 0 if the date has rolled over; otherwise accumulate.
    const priorOpenings = priorStats?.todayKey === todayKeyUtc ? Number(priorStats.openingsSentToday) || 0 : 0;
    const openingsSentToday = priorOpenings + sentLatenciesMs.length;

    // Daily history for the rolling 7-day window.
    const priorHistory = Array.isArray(priorStats?._dailyHistory) ? priorStats._dailyHistory : [];
    const dailyHistory = updateDailyHistory(priorHistory, todayKeyUtc, openingsSentToday);
    const openingsSentLast7Days = dailyHistory.reduce((acc, entry) => acc + (Number(entry.count) || 0), 0);

    // Latency window: carry forward up to 200 prior samples, then append this cycle's.
    const priorWindow = (priorStats?.todayKey === todayKeyUtc && Array.isArray(priorStats._latencyWindow))
        ? priorStats._latencyWindow.slice(-200)
        : [];
    const latencyWindow = [...priorWindow, ...sentLatenciesMs].slice(-200);

    // Compute median.
    const sortedLatencies = [...latencyWindow].sort((a, b) => a - b);
    const medianLatencyMs = sortedLatencies.length === 0
        ? (Number(priorStats?.medianLatencyMs) || 0)
        : sortedLatencies.length % 2 === 1
            ? sortedLatencies[(sortedLatencies.length - 1) / 2]
            : Math.round(
                (sortedLatencies[sortedLatencies.length / 2 - 1] + sortedLatencies[sortedLatencies.length / 2]) / 2,
              );

    const statsBody = {
        lastPollAt: now.toISOString(),
        campgroundsTracked: trackedIds.size,
        openingsSentToday,
        openingsSentLast7Days,
        medianLatencyMs,
        sampleSize: sortedLatencies.length,
        todayKey: todayKeyUtc,
        _latencyWindow: latencyWindow,
        _dailyHistory: dailyHistory,
    };

    try {
        const statsResponse = await fetch(`${subscriberApiUrl}/api/admin/stats`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${subscriberApiSecret}`,
            },
            body: JSON.stringify(statsBody),
        });
        if (!statsResponse.ok) {
            console.error(`[Warn] /api/admin/stats PUT returned ${statsResponse.status}`);
        } else {
            console.log(`[Stats] ${trackedIds.size} cgs tracked, ${sentLatenciesMs.length} sent this cycle, ${openingsSentLast7Days} last 7d, ${medianLatencyMs}ms median`);
        }
    } catch (err) {
        console.error(`[Warn] /api/admin/stats PUT failed: ${err.message}`);
    }
}

// Returns a new daily-history array with today's entry updated/inserted and
// any entries older than 7 days dropped.
function updateDailyHistory(prior, todayKey, todayCount) {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const todayMs = new Date(todayKey + 'T00:00:00Z').getTime();
    const cutoff = todayMs - SEVEN_DAYS_MS;
    const filtered = (prior || [])
        .filter((entry) => {
            if (!entry || typeof entry.date !== 'string') return false;
            const entryMs = new Date(entry.date + 'T00:00:00Z').getTime();
            if (!Number.isFinite(entryMs)) return false;
            return entryMs >= cutoff && entry.date !== todayKey;
        })
        .map((entry) => ({ date: entry.date, count: Number(entry.count) || 0 }));
    filtered.push({ date: todayKey, count: Number(todayCount) || 0 });
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    return filtered;
}

main().catch((err) => {
    console.error('[Fatal]', err);
    process.exit(1);
});
