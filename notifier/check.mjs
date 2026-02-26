// Campsite Availability Notifier
// Checks recreation.gov for new campsite openings and sends email alerts via Resend.
// Designed to run as a GitHub Actions scheduled workflow.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fetchAllCampgrounds } from './lib/fetch-availability.mjs';
import { buildSignatureSet, findNewMatches } from './lib/diff.mjs';
import { formatEmail, sendEmail } from './lib/email.mjs';

const STATE_FILE = new URL('./state.json', import.meta.url);
const PENDING_FILE = new URL('./pending-notifications.json', import.meta.url);

// --- Load campground data from the React app's source files ---
// These .js files use ES module exports but the project root lacks "type":"module",
// so Node can't import them directly. Since they're pure data (no imports, no side effects),
// we strip the `export` keyword and evaluate.
const loadDataFile = (relativePath, exportName) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
    const cleaned = source.replace(/^export\s+const\s+/gm, 'const ');
    const fn = new Function(`${cleaned}\nreturn ${exportName};`);
    return fn();
};

const campgroundCatalog = loadDataFile('../src/json/campgroundCatalog.js', 'campgroundCatalog');
const siteConfigurations = loadDataFile('../src/json/siteConfigurations.js', 'defaultCampgroundConfigurations');

// --- Settings (matching the React app's settingsOverrides in App.js) ---
const settings = {
    stayLengths: [2, 3, 4, 5],
    validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

// --- Merge catalog with configurations to build the campground list ---
const buildCampgroundList = () => {
    const campgrounds = [];

    for (const [system, catalogEntries] of Object.entries(campgroundCatalog)) {
        const configs = siteConfigurations[system] || [];

        for (const entry of catalogEntries) {
            const config = configs.find((c) => c.id === entry.id);
            campgrounds.push({
                ...entry,
                dates: config?.dates,
                sites: config?.sites || { favorites: [], worthwhile: [] },
            });
        }
    }

    return campgrounds;
};

// --- Subscriber management ---
const fetchSubscribers = async (apiUrl, apiSecret) => {
    const response = await fetch(`${apiUrl}/api/subscribers`, {
        headers: { Authorization: `Bearer ${apiSecret}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch subscribers: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.subscribers || [];
};

// --- State management ---
const loadState = () => {
    const path = new URL(STATE_FILE);
    if (!existsSync(path)) {
        return null;
    }
    try {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        return new Set(data.signatures || []);
    } catch {
        return null;
    }
};

const saveState = (signatures) => {
    const data = {
        signatures: [...signatures],
        checkedAt: new Date().toISOString(),
    };
    writeFileSync(new URL(STATE_FILE), JSON.stringify(data, null, 2));
    console.log(`[State] Saved ${signatures.size} signatures`);
};

// --- Pending notifications (for delayed delivery to non-priority subscribers) ---
const loadPending = () => {
    const path = new URL(PENDING_FILE);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
        return null;
    }
};

const savePending = (matches) => {
    const data = {
        matches,
        savedAt: new Date().toISOString(),
    };
    writeFileSync(new URL(PENDING_FILE), JSON.stringify(data, null, 2));
    console.log(`[Pending] Saved ${matches.length} matches for delayed delivery`);
};

const clearPending = () => {
    const path = new URL(PENDING_FILE);
    if (existsSync(path)) {
        writeFileSync(path, JSON.stringify({ matches: [], savedAt: null }));
    }
};

// --- Parse priority emails from env (comma-separated) ---
const parsePriorityEmails = () => {
    const raw = process.env.PRIORITY_EMAILS || '';
    return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
};

// --- Main ---
const DELAY_MINUTES = 15;

const main = async () => {
    const resendApiKey = process.env.RESEND_API_KEY;
    const subscriberApiUrl = process.env.SUBSCRIBER_API_URL;
    const subscriberApiSecret = process.env.SUBSCRIBER_API_SECRET;
    const siteUrl = process.env.SITE_URL || '';

    if (!resendApiKey) {
        console.error('[Error] Missing RESEND_API_KEY');
        process.exit(1);
    }
    if (!subscriberApiUrl || !subscriberApiSecret) {
        console.error('[Error] Missing SUBSCRIBER_API_URL or SUBSCRIBER_API_SECRET');
        process.exit(1);
    }

    const priorityEmails = parsePriorityEmails();
    console.log(`[Priority] ${priorityEmails.length} priority email(s): ${priorityEmails.join(', ') || '(none)'}`);

    // Fetch subscriber list from the CF Worker
    let allSubscribers = [];
    try {
        allSubscribers = await fetchSubscribers(subscriberApiUrl, subscriberApiSecret);
    } catch (err) {
        console.warn(`[Subscribers] Could not fetch subscriber list: ${err.message}`);
        console.warn('[Subscribers] Continuing with priority emails only');
    }
    console.log(`[Subscribers] ${allSubscribers.length} subscriber(s)`);

    if (allSubscribers.length === 0 && priorityEmails.length === 0) {
        console.log('[Done] No subscribers — skipping check.');
        return;
    }

    // Split subscribers into priority and regular
    const prioritySet = new Set(priorityEmails);
    const regularSubscribers = allSubscribers.filter(e => !prioritySet.has(e));

    // --- Check for pending notifications ready to send to regular subscribers ---
    const pending = loadPending();
    if (pending?.matches?.length > 0 && pending.savedAt) {
        const savedAt = new Date(pending.savedAt);
        const ageMinutes = (Date.now() - savedAt.getTime()) / 60_000;
        if (ageMinutes >= DELAY_MINUTES) {
            console.log(`[Pending] ${pending.matches.length} matches are ${Math.round(ageMinutes)}min old — sending to ${regularSubscribers.length} regular subscriber(s)`);
            for (const email of regularSubscribers) {
                const { subject, html, unsubscribeLink } = formatEmail(pending.matches, {
                    unsubscribeUrl: `${subscriberApiUrl}/api/unsubscribe`,
                    email,
                    apiSecret: subscriberApiSecret,
                    siteUrl,
                });
                console.log(`[Email] Sending to ${email}: "${subject}"`);
                await sendEmail(email, subject, html, resendApiKey, unsubscribeLink);
            }
            clearPending();
        } else {
            console.log(`[Pending] ${pending.matches.length} matches are ${Math.round(ageMinutes)}min old — waiting for ${DELAY_MINUTES}min delay`);
        }
    }

    // --- Fetch and check for new availability ---
    const campgrounds = buildCampgroundList();
    console.log(`[Start] Checking ${campgrounds.length} campgrounds`);

    const results = await fetchAllCampgrounds(campgrounds, settings);

    const currentSignatures = buildSignatureSet(results);
    console.log(`[Diff] ${currentSignatures.size} total match signatures`);

    const previousSignatures = loadState();

    const forceEmail = process.env.FORCE_EMAIL === 'true';
    if (previousSignatures === null && !forceEmail) {
        console.log('[First Run] No previous state found. Seeding state — no email sent.');
        saveState(currentSignatures);
        return;
    }
    if (previousSignatures === null && forceEmail) {
        console.log('[First Run] No previous state — but FORCE_EMAIL is set, treating all matches as new.');
    }

    // Find new matches — favorites only
    const allConfigs = Object.values(siteConfigurations).flat();
    const allNewMatches = findNewMatches(results, previousSignatures, allConfigs);
    const newMatches = allNewMatches.filter(m => m.group === 'favorites');
    console.log(`[Diff] ${allNewMatches.length} new matches total, ${newMatches.length} favorites`);

    if (newMatches.length > 0) {
        // Send immediately to priority subscribers
        if (priorityEmails.length > 0) {
            console.log(`[Priority] Sending ${newMatches.length} matches to ${priorityEmails.length} priority subscriber(s)`);
            for (const email of priorityEmails) {
                const { subject, html, unsubscribeLink } = formatEmail(newMatches, {
                    unsubscribeUrl: `${subscriberApiUrl}/api/unsubscribe`,
                    email,
                    apiSecret: subscriberApiSecret,
                    siteUrl,
                });
                console.log(`[Email] Sending to ${email} (priority): "${subject}"`);
                await sendEmail(email, subject, html, resendApiKey, unsubscribeLink);
            }
        }

        // Queue for regular subscribers (delayed delivery)
        if (regularSubscribers.length > 0) {
            // Merge with any existing pending matches
            const existingPending = loadPending();
            const merged = [...(existingPending?.matches || []), ...newMatches];
            savePending(merged);
        } else {
            console.log('[Done] No regular subscribers to queue for.');
        }
    } else {
        console.log('[Done] No new favorite availability — no email sent.');
    }

    // Save current state for next run
    saveState(currentSignatures);
};

main().catch((err) => {
    console.error('[Fatal]', err);
    process.exit(1);
});
