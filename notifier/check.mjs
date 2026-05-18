// Campsite Availability Notifier — per-user rewire (Phase 5)
// Pulls per-user campground lists from /api/admin/notification-targets,
// deduplicates recreation.gov fetches, and emails each user about their own matches.
// Designed to run as a GitHub Actions scheduled workflow.

import { fetchMonth, processCampgroundResults, getAllDatesInRange } from './lib/fetch-availability.mjs';
import { findNewMatches, generateSignature } from './lib/diff.mjs';
import { formatEmail, sendEmail } from './lib/email.mjs';

const DELAY_BETWEEN_FETCHES_MS = 500;

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

    // 5. Per user: compute matches against their filters, diff against their state.
    const updates = [];
    for (const target of eligible) {
        const userMatches = computeMatchesForUser(target, rawByCampground);
        const priorState = target.notifierState ?? null;
        const isFirstRun = priorState === null;
        const { newMatches, nextState } = diffPerUser(userMatches, priorState);

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
            await sendEmailToUser({ user: target, matches: newMatches, resendApiKey, siteUrl, apiSecret: subscriberApiSecret });
            updates.push({ email: target.email, state: nextState, lastNotifiedAt: now.toISOString() });
        } catch (err) {
            console.error(`[${target.email}] email send failed: ${err.message}`);
            updates.push({ email: target.email, state: nextState });
        }
    }

    // 6. Push state back to the API.
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
}

main().catch((err) => {
    console.error('[Fatal]', err);
    process.exit(1);
});
