// Email formatting and sending via Resend API.
// No dependencies — uses native fetch and Node crypto.

import { createHmac } from "node:crypto";
import type { MatchResult } from "./diff";
import type { AdjacentGroup } from "../../next/src/lib/adjacent-groups";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormatEmailOptions {
    unsubscribeUrl?: string;
    email?: string;
    apiSecret?: string;
    siteUrl?: string;
    /** Adjacent-site groups to feature above the per-site openings. */
    adjacentGroups?: AdjacentGroup[];
    /** campgroundId -> display name, used to label the adjacent-group block. */
    campgroundNamesById?: Record<string, string>;
}

export interface FormattedEmail {
    subject: string;
    html: string;
    unsubscribeLink: string;
}

interface CampgroundGroup {
    area: string;
    description: string | null | undefined;
    matches: MatchResult[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Generate HMAC token matching the CF Worker's implementation
const generateUnsubscribeToken = (email: string, secret: string): string => {
    return createHmac("sha256", secret).update(email).digest("hex");
};

export const formatDate = (dateStr: string): string => {
    const parts = dateStr.split("-").map(Number);
    const y = parts[0] ?? 0;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = DAY_NAMES[date.getUTCDay()];
    const month = MONTH_NAMES[date.getUTCMonth()];
    return `${day} ${month} ${date.getUTCDate()}`;
};

export const buildReservationLink = (siteId: string, fromDate: string, nights: number): string => {
    const from = new Date(fromDate);
    const to = new Date(from);
    to.setDate(from.getDate() + nights);
    const arrival = from.toISOString().split("T")[0];
    const departure = to.toISOString().split("T")[0];
    return `https://www.recreation.gov/camping/campsites/${siteId}?arrivalDate=${arrival}&departureDate=${departure}`;
};

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
    paper: "#F4EAD8",
    cream: "#FBF6EA",
    ink: "#1A1614",
    inkSoft: "#5e554e",
    inkSubtle: "#8c8278",
    rule: "#d9cebb",
    ruleSoft: "#e8dfcb",
    forest: "#1F3D2A",
    forestDeep: "#142a1d",
    clay: "#B65C3F",
    mustard: "#C9A227",
    sand: "#f6c79c",
    creampale: "rgba(251,246,234,0.55)",
    creamwarm: "rgba(251,246,234,0.78)",
    creamlink: "rgba(251,246,234,0.70)",
};

// ── Font cascades ─────────────────────────────────────────────────────────────
const F = {
    poster: `'Big Shoulders Display', Impact, 'Arial Black', sans-serif`,
    ital: `Georgia, 'Times New Roman', serif`,
    body: `Georgia, 'Times New Roman', serif`,
    mono: `'Courier New', Courier, monospace`,
};

// ── Composable helpers ────────────────────────────────────────────────────────

/** The notification/inbox preview text. Leads with the lead opening's site,
 *  arrival day, and length of stay so the dates show up in the phone alert.
 *  The campground is omitted for single-campground digests (the subject already
 *  names it) and included when several campgrounds are mixed. Exported for tests. */
export const buildPreheaderText = (matches: MatchResult[]): string => {
    const count = matches.length;
    if (count === 0) return "New openings on your watchlist";

    const shortName = (n: string) => n.replace(/\s+campground$/i, "");
    const siteLabel = (m: MatchResult) => m.siteName.replace(/^Site\s+/i, "");

    const fav = matches.find((m) => m.group === "favorites");
    const head = fav ?? matches[0]!;
    const multiCampground = new Set(matches.map((m) => m.campgroundName)).size > 1;

    const star = head.group === "favorites" ? "★ " : "";
    const siteRef = multiCampground
        ? `${shortName(head.campgroundName)} ${siteLabel(head)}`
        : `Site ${siteLabel(head)}`;
    const arrival = formatDate(head.match.from); // e.g. "Fri Jul 4"
    const nights = `${head.match.nights} ${head.match.nights === 1 ? "night" : "nights"}`;
    const lead = `${star}${siteRef} · ${arrival} · ${nights}`;

    const remaining = count - 1;
    return remaining > 0 ? `${lead} +${remaining} more opening${remaining === 1 ? "" : "s"}` : lead;
};

const buildPreheader = (matches: MatchResult[]): string => {
    const text = buildPreheaderText(matches);

    // Padding (zero-width joiner + nbsp) so clients don't pull body boilerplate
    // (the masthead / "Polling every 5 min" meta bar) into the preview snippet.
    const pad = "&zwnj;&nbsp;".repeat(80);

    return `
                    <!-- PRE-HEADER (hidden, inbox/watch preview text) -->
                    <tr>
                        <td style="display:none;overflow:hidden;max-height:0;max-width:0;opacity:0;mso-hide:all;">${text}${pad}</td>
                    </tr>`;
};

const buildHeader = (count: number, uniqueCampgroundNames: string[], logoUrl: string): string => {
    const shortNames = uniqueCampgroundNames.map((n) => n.replace(/\s+campground$/i, "").toUpperCase());
    let headlineNames;
    if (shortNames.length <= 2) {
        headlineNames = shortNames.join(" &middot; ") + ".";
    } else {
        headlineNames = shortNames.slice(0, 2).join(" &middot; ") + ` + ${shortNames.length - 2} MORE.`;
    }
    const headlineCount = `${count} NEW OPENING${count === 1 ? "" : "S"}`;

    return `
                    <!-- HEADER — forest-deep banner -->
                    <tr>
                        <td bgcolor="${C.forestDeep}" style="background-color:${C.forestDeep};padding:24px 18px 22px 18px;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                                <tbody>
                                    <tr>
                                        <td>
                                            <!-- Logo row -->
                                            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                                                <tbody>
                                                    <tr>
                                                        <td style="vertical-align:middle;">
                                                            ${
                                                                logoUrl
                                                                    ? `<img src="${logoUrl}" alt="CampWatch" width="28" height="28" style="width:28px;height:28px;display:block;background-color:${C.cream};" />`
                                                                    : `<div style="width:28px;height:28px;background-color:${C.cream};display:inline-block;"></div>`
                                                            }
                                                        </td>
                                                        <td style="vertical-align:middle;padding-left:10px;">
                                                            <span style="font-family:${F.poster};font-weight:900;font-size:16px;color:${C.cream};letter-spacing:0.06em;text-transform:uppercase;">CampWatch</span>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                            <!-- Poster headline -->
                                            <div style="font-family:${F.poster};font-weight:900;font-size:26px;line-height:28px;color:${C.cream};letter-spacing:-0.005em;text-transform:uppercase;">
                                                <span style="color:${C.sand};">${headlineCount}</span><br/>
                                                ${headlineNames}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>`;
};

const buildMetaBar = (timestamp: string): string => {
    return `
                    <!-- META BAR — stacked (mobile-first) -->
                    <tr>
                        <td bgcolor="${C.paper}" style="background-color:${C.paper};padding:14px 18px;border-top:1px solid ${C.forest};border-bottom:1px solid ${C.rule};">
                            <div style="font-family:${F.mono};font-weight:700;font-size:12px;color:${C.inkSubtle};letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px;">Checked ${timestamp}</div>
                            <div style="font-family:${F.mono};font-weight:700;font-size:12px;color:${C.clay};letter-spacing:0.14em;text-transform:uppercase;">&#9679; LIVE &middot; Polling every 5 min</div>
                        </td>
                    </tr>`;
};

const MT_TIME = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Boise",
    hour: "numeric",
    minute: "2-digit",
});
const MT_DATE_TIME = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Boise",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

/** "Spotted 2:14 PM MT · 3 min before this email" — absolute Mountain Time plus
 *  the age at send. Exported for tests; nowMs injected for determinism.
 *  Returns "" for a malformed timestamp so callers can safely skip the line. */
export const formatSpottedLine = (firstSeenIso: string, nowMs: number): string => {
    if (isNaN(new Date(firstSeenIso).getTime())) return "";
    const seen = new Date(firstSeenIso);
    const ageMin = Math.floor((nowMs - seen.getTime()) / 60_000);

    let rel: string;
    if (ageMin < 1) rel = "under a minute";
    else if (ageMin < 60) rel = `${ageMin} min`;
    else if (ageMin < 24 * 60) rel = `${Math.floor(ageMin / 60)} hr ${ageMin % 60} min`;
    else {
        const days = Math.floor(ageMin / (24 * 60));
        const hrs = Math.floor((ageMin % (24 * 60)) / 60);
        rel = `${days} ${days === 1 ? "day" : "days"} ${hrs} hr`;
    }

    // Include the date once it's no longer "today-ish" — a day or more old.
    const abs =
        ageMin >= 24 * 60
            ? `${MT_DATE_TIME.format(seen).replace(/ | /g, " ")} MT`
            : `${MT_TIME.format(seen).replace(/ | /g, " ")} MT`;
    return `Spotted ${abs} · ${rel} before this email`;
};

const buildOpeningCard = (match: MatchResult): string => {
    const link = buildReservationLink(match.siteId, match.match.from, match.match.nights);
    const siteName = match.siteName.replace(/^Site\s+/i, "");
    const dateRange = `${formatDate(match.match.from)} &nbsp;&rarr;&nbsp; ${formatDate(match.match.to)}`;
    const nightsText = `${match.match.nights} ${match.match.nights === 1 ? "night" : "nights"}`;
    const spottedLine = match.firstSeenAt ? formatSpottedLine(match.firstSeenAt, Date.now()) : "";
    const spottedHtml = spottedLine
        ? `<div style="font-family:${F.mono};font-size:12px;color:${C.inkSubtle};letter-spacing:0.08em;margin-top:6px;">${spottedLine}</div>`
        : "";

    // Tier badge
    let badgeBg: string, badgeColor: string, badgeLabel: string;
    if (match.group === "favorites") {
        badgeBg = C.forest;
        badgeColor = C.cream;
        badgeLabel = "&#9733; Favorite site";
    } else if (match.group === "worthwhile") {
        badgeBg = C.mustard;
        badgeColor = C.ink;
        badgeLabel = "Acceptable site";
    } else {
        badgeBg = C.rule;
        badgeColor = C.ink;
        badgeLabel = "On your watchlist";
    }

    return `
                        <tr>
                            <td style="padding-bottom:10px;">
                                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.cream};border:1.5px solid ${C.ink};border-collapse:separate;">
                                    <tbody>
                                        <tr>
                                            <td style="padding:14px 16px 4px 16px;vertical-align:middle;">
                                                <!-- Tier badge -->
                                                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                                                    <tbody>
                                                        <tr>
                                                            <td bgcolor="${badgeBg}" style="background-color:${badgeBg};font-family:${F.mono};font-size:12px;color:${badgeColor};letter-spacing:0.18em;text-transform:uppercase;font-weight:700;padding:4px 8px;">${badgeLabel}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!-- Site number -->
                                                <div style="font-family:${F.ital};font-style:italic;font-size:22px;line-height:26px;color:${C.ink};">Site ${siteName}</div>
                                                <!-- Dates -->
                                                <div style="font-family:${F.body};font-weight:bold;font-size:16px;line-height:22px;color:${C.ink};margin-top:6px;">${dateRange}</div>
                                                <!-- Nights -->
                                                <div style="font-family:${F.mono};font-weight:700;font-size:13px;color:${C.inkSubtle};letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">${nightsText}</div>
                                                ${spottedHtml}
                                            </td>
                                        </tr>
                                        <!-- Book button — full-width, stacked below -->
                                        <tr>
                                            <td style="padding:0 16px 16px 16px;">
                                                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                                    <tbody>
                                                        <tr>
                                                            <td bgcolor="${C.forest}" align="center" style="background-color:${C.forest};">
                                                                <a href="${link}" style="display:block;padding:13px 12px;font-family:${F.poster};font-weight:800;font-size:13px;color:${C.cream};text-decoration:none;letter-spacing:0.12em;text-transform:uppercase;text-align:center;">Book on recreation.gov &rarr;</a>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>`;
};

// Featured block for adjacent-site groups. Mirrors the per-match card markup/styles
// (cream card, ink border, forest book buttons), but lists every site in the group
// with its own rec.gov booking link, since rec.gov has no single multi-site link.
const buildAdjacentGroupCard = (group: AdjacentGroup, campgroundName: string): string => {
    const siteNames = group.siteNames.map((s) => s.replace(/^Site\s+/i, ""));
    const dateRange = `${formatDate(group.from)} &nbsp;&rarr;&nbsp; ${formatDate(group.to)}`;
    const nightsText = `${group.nights} ${group.nights === 1 ? "night" : "nights"}`;

    // Tier badge: a fav/worthwhile anchor in the cluster gets a stronger badge.
    let badgeBg: string, badgeColor: string, badgeLabel: string;
    if (group.anchorTier === "favorites") {
        badgeBg = C.forest;
        badgeColor = C.cream;
        badgeLabel = `&#9733; ${siteNames.length} adjacent sites`;
    } else if (group.anchorTier === "worthwhile") {
        badgeBg = C.mustard;
        badgeColor = C.ink;
        badgeLabel = `${siteNames.length} adjacent sites`;
    } else {
        badgeBg = C.clay;
        badgeColor = C.cream;
        badgeLabel = `${siteNames.length} adjacent sites`;
    }

    const bookButtons = group.siteIds
        .map((id, i) => {
            const link = buildReservationLink(id, group.from, group.nights);
            const label = siteNames[i] ?? id;
            return `
                                                        <tr>
                                                            <td bgcolor="${C.forest}" align="center" style="background-color:${C.forest};padding-bottom:1px;">
                                                                <a href="${link}" style="display:block;padding:11px 12px;font-family:${F.poster};font-weight:800;font-size:13px;color:${C.cream};text-decoration:none;letter-spacing:0.10em;text-transform:uppercase;text-align:center;">Book Site ${label} on recreation.gov &rarr;</a>
                                                            </td>
                                                        </tr>`;
        })
        .join("");

    return `
                        <tr>
                            <td style="padding-bottom:10px;">
                                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.cream};border:1.5px solid ${C.ink};border-collapse:separate;">
                                    <tbody>
                                        <tr>
                                            <td style="padding:14px 16px 4px 16px;vertical-align:middle;">
                                                <!-- Tier badge -->
                                                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                                                    <tbody>
                                                        <tr>
                                                            <td bgcolor="${badgeBg}" style="background-color:${badgeBg};font-family:${F.mono};font-size:12px;color:${badgeColor};letter-spacing:0.18em;text-transform:uppercase;font-weight:700;padding:4px 8px;">${badgeLabel}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!-- Campground -->
                                                <div style="font-family:${F.poster};font-weight:900;font-size:18px;line-height:22px;color:${C.ink};text-transform:uppercase;letter-spacing:0.005em;">${campgroundName}</div>
                                                <!-- Site numbers -->
                                                <div style="font-family:${F.ital};font-style:italic;font-size:22px;line-height:26px;color:${C.ink};margin-top:4px;">Sites ${siteNames.join(", ")}</div>
                                                <!-- Dates -->
                                                <div style="font-family:${F.body};font-weight:bold;font-size:16px;line-height:22px;color:${C.ink};margin-top:6px;">${dateRange}</div>
                                                <!-- Nights -->
                                                <div style="font-family:${F.mono};font-weight:700;font-size:13px;color:${C.inkSubtle};letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">${nightsText} &middot; side by side</div>
                                            </td>
                                        </tr>
                                        <!-- One book button per site, stacked -->
                                        <tr>
                                            <td style="padding:8px 16px 16px 16px;">
                                                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                                    <tbody>${bookButtons}
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>`;
};

const buildAdjacentSection = (
    groups: AdjacentGroup[],
    campgroundNamesById: Record<string, string>,
): string => {
    const cards = groups
        .map((g) => buildAdjacentGroupCard(g, campgroundNamesById[g.campgroundId] ?? "A campground"))
        .join("");

    return `
        <tr>
            <td bgcolor="${C.paper}" style="background-color:${C.paper};padding:28px 18px 6px 18px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tbody>
                        <tr>
                            <td style="padding-bottom:8px;">
                                <div style="font-family:${F.mono};font-weight:700;font-size:13px;color:${C.clay};letter-spacing:0.18em;text-transform:uppercase;">&sect; Adjacent openings</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-bottom:14px;">
                                <div style="font-family:${F.ital};font-style:italic;font-size:16px;line-height:22px;color:${C.inkSoft};">Neighboring sites open for the same nights &mdash; grab the cluster before they split up.</div>
                            </td>
                        </tr>
                        ${cards}
                    </tbody>
                </table>
            </td>
        </tr>`;
};

const buildCampgroundSection = (
    group: CampgroundGroup & { name: string },
    indexOfFirstOpening: number,
    totalOpenings: number,
): string => {
    const { name, area, description, matches } = group;
    const sectionParts: string[] = [];

    // Section row
    sectionParts.push(`
        <tr>
            <td bgcolor="${C.paper}" style="background-color:${C.paper};padding:28px 18px 6px 18px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tbody>`);

    // Build the eyebrow: "§ Opening N–M of total" or "§ Opening N of M" for single
    let eyebrow: string;
    if (matches.length === 1) {
        eyebrow = `&sect; Opening ${indexOfFirstOpening + 1} of ${totalOpenings}`;
    } else {
        eyebrow = `&sect; Openings ${indexOfFirstOpening + 1}&ndash;${indexOfFirstOpening + matches.length} of ${totalOpenings}`;
    }

    sectionParts.push(`
                        <tr>
                            <td style="padding-bottom:8px;">
                                <div style="font-family:${F.mono};font-weight:700;font-size:13px;color:${C.clay};letter-spacing:0.18em;text-transform:uppercase;">${eyebrow}</div>
                            </td>
                        </tr>`);

    // Campground name
    sectionParts.push(`
                        <tr>
                            <td style="padding-bottom:4px;">
                                <div style="font-family:${F.poster};font-weight:900;font-size:22px;line-height:26px;color:${C.ink};text-transform:uppercase;letter-spacing:0.005em;">${name}</div>
                            </td>
                        </tr>`);

    // Area (italic)
    if (area) {
        sectionParts.push(`
                        <tr>
                            <td style="padding-bottom:14px;">
                                <div style="font-family:${F.ital};font-style:italic;font-size:16px;line-height:22px;color:${C.inkSoft};">${area}</div>
                            </td>
                        </tr>`);
    } else {
        sectionParts.push(`
                        <tr><td style="padding-bottom:14px;"></td></tr>`);
    }

    // Optional description
    if (description) {
        sectionParts.push(`
                        <tr>
                            <td style="padding-bottom:18px;">
                                <div style="font-family:${F.body};font-size:14px;line-height:22px;color:${C.inkSoft};">${description}</div>
                            </td>
                        </tr>`);
    }

    // Per-match cards
    for (const m of matches) {
        sectionParts.push(buildOpeningCard(m));
    }

    sectionParts.push(`
                    </tbody>
                </table>
            </td>
        </tr>`);

    return sectionParts.join("");
};

const buildDashboardCta = (siteUrl: string | undefined): string => {
    const ctaHref = siteUrl ? siteUrl : "https://campwatch.dev";
    return `
        <tr>
            <td bgcolor="${C.paper}" style="background-color:${C.paper};padding:12px 18px 36px 18px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tbody>
                        <tr>
                            <td align="center" style="padding-top:18px;border-top:1px solid ${C.rule};">
                                <a href="${ctaHref}" style="display:inline-block;font-family:${F.poster};font-weight:800;font-size:12px;color:${C.ink};text-decoration:underline;letter-spacing:0.14em;text-transform:uppercase;padding:4px 6px;">Open your dashboard &rarr;</a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>`;
};

// Shown when the per-site openings exceed MAX_OPENING_CARDS: a dashed row that
// names the remainder and links to the dashboard, so a huge batch doesn't produce
// a runaway email.
const buildMoreOpeningsRow = (hiddenCount: number, siteUrl: string | undefined): string => {
    const href = siteUrl ? siteUrl : "https://campwatch.dev";
    return `
        <tr>
            <td bgcolor="${C.paper}" style="background-color:${C.paper};padding:6px 18px 0 18px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tbody>
                        <tr>
                            <td style="padding:14px 16px;border:1px dashed ${C.rule};">
                                <div style="font-family:${F.ital};font-style:italic;font-size:16px;line-height:22px;color:${C.inkSoft};">+ ${hiddenCount} more opening${hiddenCount === 1 ? "" : "s"} not shown here. <a href="${href}" style="color:${C.ink};text-decoration:underline;">See them all on your dashboard &rarr;</a></div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>`;
};

const buildFooter = (unsubscribeHtml: string, siteUrl: string | undefined): string => {
    const settingsLink = siteUrl ? `${siteUrl}/app/account` : "https://campwatch.dev/app/account";
    return `
        <tr>
            <td bgcolor="${C.forestDeep}" style="background-color:${C.forestDeep};padding:28px 18px 32px 18px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tbody>
                        <tr>
                            <td>
                                <div style="font-family:${F.ital};font-style:italic;font-size:18px;line-height:26px;color:${C.sand};margin-bottom:4px;">Yours from the trail,</div>
                                <div style="font-family:${F.poster};font-weight:900;font-size:22px;line-height:28px;color:${C.cream};letter-spacing:0.04em;text-transform:uppercase;margin-bottom:16px;">&mdash;&nbsp;CampWatch</div>
                                <div style="font-family:${F.mono};font-weight:700;font-size:13px;color:${C.creampale};letter-spacing:0.12em;text-transform:uppercase;line-height:20px;">
                                    You're getting this because you signed up for CampWatch alerts.<br/>
                                    <a href="${settingsLink}" style="color:${C.creamlink};text-decoration:underline;">Notification settings</a>
                                    &nbsp;&middot;&nbsp;
                                    ${unsubscribeHtml}
                                    &nbsp;&middot;&nbsp;
                                    <a href="mailto:hello@campwatch.dev" style="color:${C.creamlink};text-decoration:underline;">Reply directly</a>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>`;
};

// Max per-site opening cards rendered in one email; the rest link to the dashboard.
const MAX_OPENING_CARDS = 10;

// ── Orchestrator ──────────────────────────────────────────────────────────────

export const formatEmail = (newMatches: MatchResult[], options: FormatEmailOptions = {}): FormattedEmail => {
    const { unsubscribeUrl, email, apiSecret, siteUrl } = options;
    const unsubscribeOptions = { unsubscribeUrl, email, apiSecret };
    const count = newMatches.length;
    const adjacentGroups = options.adjacentGroups ?? [];
    const campgroundNamesById = options.campgroundNamesById ?? {};

    // Campground names: union of per-site matches and any adjacent-group campgrounds,
    // so a groups-only email still names the right campground in the banner/header.
    const groupCampgroundNames = adjacentGroups.map(
        (g) => campgroundNamesById[g.campgroundId] ?? "A campground",
    );
    const uniqueCampgroundNames = [
        ...new Set([...newMatches.map((m) => m.campgroundName), ...groupCampgroundNames]),
    ];

    // Subject line. Adjacent groups lead when present (the headline feature), then
    // fall back to the per-site opening count.
    let subject: string;
    if (adjacentGroups.length > 0) {
        const g = adjacentGroups[0]!;
        const name = campgroundNamesById[g.campgroundId] ?? "a campground";
        subject =
            `${g.siteIds.length} adjacent sites open at ${name}` +
            (adjacentGroups.length > 1 ? ` (+${adjacentGroups.length - 1} more)` : "");
    } else if (count === 1) {
        subject = `1 new opening · ${uniqueCampgroundNames[0]}`;
    } else {
        subject = `${count} new openings · ${uniqueCampgroundNames.join(", ")}`;
    }

    // Group by campground
    const byCampground: Record<string, CampgroundGroup> = {};
    for (const m of newMatches) {
        if (!byCampground[m.campgroundName]) {
            byCampground[m.campgroundName] = {
                area: m.campgroundArea,
                description: m.campgroundDescription,
                matches: [],
            };
        }
        byCampground[m.campgroundName]?.matches.push(m);
    }

    // Sort: favorites first within each campground
    const groupOrder: Record<string, number> = { favorites: 0, worthwhile: 1, "all-others": 2 };
    for (const name in byCampground) {
        byCampground[name]?.matches.sort((a, b) => (groupOrder[a.group] ?? 0) - (groupOrder[b.group] ?? 0));
    }

    // ── Timestamp ────────────────────────────────────────────────────────────
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
        timeZone: "America/Boise",
        dateStyle: "medium",
        timeStyle: "short",
    });

    // ── Build unsubscribe link ────────────────────────────────────────────────
    let unsubscribeLink = "";
    if (unsubscribeOptions.unsubscribeUrl && unsubscribeOptions.email && unsubscribeOptions.apiSecret) {
        const token = generateUnsubscribeToken(unsubscribeOptions.email, unsubscribeOptions.apiSecret);
        unsubscribeLink = `${unsubscribeOptions.unsubscribeUrl}?email=${encodeURIComponent(unsubscribeOptions.email)}&token=${token}`;
    }

    // ── Logo URL ─────────────────────────────────────────────────────────────
    const logoUrl = siteUrl ? `${siteUrl}/images/logos/CampWatch_Logo_trimmed_small.png` : "";

    // ── Adjacent-group section (featured, above per-site openings) ────────────
    const adjacentSection =
        adjacentGroups.length > 0 ? buildAdjacentSection(adjacentGroups, campgroundNamesById) : "";

    // ── Cap the per-site opening cards ────────────────────────────────────────
    // A fresh drop can match dozens of sites at once; a 50-card email is unwieldy
    // and clips in some clients. Keep the existing campground-grouped,
    // favorites-first order and link to the dashboard for the remainder. Adjacent
    // groups (the headline feature, usually few) are not capped.
    let openingBudget = MAX_OPENING_CARDS;
    const cappedEntries: [string, CampgroundGroup][] = [];
    for (const [name, group] of Object.entries(byCampground)) {
        if (openingBudget <= 0) break;
        const shown = group.matches.slice(0, openingBudget);
        openingBudget -= shown.length;
        cappedEntries.push([name, { ...group, matches: shown }]);
    }
    const hiddenCount = count - (MAX_OPENING_CARDS - openingBudget);

    // ── Per-campground sections ───────────────────────────────────────────────
    let openingCounter = 0;
    const campgroundSections = cappedEntries
        .map(([name, { area, description, matches }]) => {
            const indexOfFirstOpening = openingCounter;
            openingCounter += matches.length;
            return buildCampgroundSection({ name, area, description, matches }, indexOfFirstOpening, count);
        })
        .join("\n");

    // Banner count includes adjacent groups so a groups-only email doesn't read
    // "0 NEW OPENINGS"; each group counts as one featured opening.
    const headerCount = count + adjacentGroups.length;

    // ── Unsubscribe footer HTML ───────────────────────────────────────────────
    const unsubscribeFooterHtml = unsubscribeLink
        ? `<a href="${unsubscribeLink}" style="color:${C.creamlink};text-decoration:underline;">Unsubscribe</a>`
        : `<a href="https://campwatch.dev/unsubscribe" style="color:${C.creamlink};text-decoration:underline;">Unsubscribe</a>`;

    // ── Full HTML ─────────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body bgcolor="${C.paper}" style="margin:0;padding:0;background-color:${C.paper};">

<!-- Outer wrapper -->
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.paper};">
    <tr>
        <td align="center" style="padding:24px 0 32px 0;">

            <!-- Email card — max 600px -->
            <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;">
                <tbody>
${buildPreheader(newMatches)}
${buildHeader(headerCount, uniqueCampgroundNames, logoUrl)}
${buildMetaBar(timestamp)}

                    <!-- ADJACENT OPENINGS — featured group block -->
                    ${adjacentSection}

                    <!-- OPENINGS — one section per campground -->
                    ${campgroundSections}

                    <!-- "+N more" when the opening cards were capped -->
                    ${hiddenCount > 0 ? buildMoreOpeningsRow(hiddenCount, siteUrl) : ""}

                    <!-- CTA -->
                    ${buildDashboardCta(siteUrl)}

                    <!-- FOOTER -->
                    ${buildFooter(unsubscribeFooterHtml, siteUrl)}

                </tbody>
            </table>

        </td>
    </tr>
</table>

</body>
</html>`;

    return { subject, html, unsubscribeLink };
};

export const sendEmail = async (
    to: string,
    subject: string,
    html: string,
    apiKey: string,
    unsubscribeLink = "",
): Promise<unknown> => {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "CampWatch <alerts@campwatch.dev>",
            reply_to: "hello@campwatch.dev",
            to: [to],
            subject,
            html,
            ...(unsubscribeLink
                ? {
                      headers: {
                          "List-Unsubscribe": `<${unsubscribeLink}>`,
                          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                      },
                  }
                : {}),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as { id: string };
    console.log(`[Email] Sent to ${to}, id: ${result.id}`);
    return result;
};
