// Email formatting and sending via Resend API.
// No dependencies — uses native fetch and Node crypto.

import { createHmac } from "node:crypto";
import type { MatchResult } from "./diff";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormatEmailOptions {
    unsubscribeUrl?: string;
    email?: string;
    apiSecret?: string;
    siteUrl?: string;
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

const formatDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = DAY_NAMES[date.getUTCDay()];
    const month = MONTH_NAMES[date.getUTCMonth()];
    return `${day} ${month} ${date.getUTCDate()}`;
};

const buildReservationLink = (siteId: string, fromDate: string, nights: number): string => {
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

const buildPreheader = (count: number, uniqueNames: string[]): string => {
    const preheaderNames = uniqueNames.join(" · ");
    const preheaderText = `${count} new opening${count === 1 ? "" : "s"} on your watchlist · ${preheaderNames}`;
    return `
                    <!-- PRE-HEADER (hidden, inbox preview text) -->
                    <tr>
                        <td style="display:none;overflow:hidden;max-height:0;max-width:0;opacity:0;mso-hide:all;">${preheaderText}</td>
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
    const subhead =
        count === 1
            ? `One new site came open. It matches your window.`
            : `${count} new sites came open. ${count === 2 ? "Both match" : "All match"} your window.`;

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
                                            <!-- Field Bulletin label — stacked below wordmark on mobile -->
                                            <div style="font-family:${F.mono};font-size:10px;color:${C.creampale};letter-spacing:0.18em;text-transform:uppercase;margin-bottom:14px;">Field Bulletin &middot; No. 0142</div>
                                            <!-- Poster headline -->
                                            <div style="font-family:${F.poster};font-weight:900;font-size:26px;line-height:28px;color:${C.cream};letter-spacing:-0.005em;text-transform:uppercase;margin-bottom:4px;">
                                                <span style="color:${C.sand};">${headlineCount}</span><br/>
                                                ${headlineNames}
                                            </div>
                                            <!-- Italic subhead -->
                                            <div style="font-family:${F.ital};font-style:italic;font-size:16px;line-height:24px;color:${C.creamwarm};margin-top:6px;">${subhead}</div>
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
                            <div style="font-family:${F.mono};font-size:10px;color:${C.inkSubtle};letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px;">Checked ${timestamp}</div>
                            <div style="font-family:${F.mono};font-size:10px;color:${C.clay};letter-spacing:0.14em;text-transform:uppercase;">&#9679; LIVE &middot; Polling every 5 min</div>
                        </td>
                    </tr>`;
};

const buildOpeningCard = (match: MatchResult): string => {
    const link = buildReservationLink(match.siteId, match.match.from, match.match.nights);
    const siteName = match.siteName.replace(/^Site\s+/i, "");
    const dateRange = `${formatDate(match.match.from)} &nbsp;&rarr;&nbsp; ${formatDate(match.match.to)}`;
    const nightsText = `${match.match.nights} ${match.match.nights === 1 ? "night" : "nights"}`;

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
                                                            <td bgcolor="${badgeBg}" style="background-color:${badgeBg};font-family:${F.mono};font-size:10px;color:${badgeColor};letter-spacing:0.18em;text-transform:uppercase;font-weight:700;padding:4px 8px;">${badgeLabel}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!-- Site number -->
                                                <div style="font-family:${F.ital};font-style:italic;font-size:22px;line-height:26px;color:${C.ink};">Site ${siteName}</div>
                                                <!-- Dates -->
                                                <div style="font-family:${F.body};font-weight:bold;font-size:16px;line-height:22px;color:${C.ink};margin-top:6px;">${dateRange}</div>
                                                <!-- Nights -->
                                                <div style="font-family:${F.mono};font-size:11px;color:${C.inkSubtle};letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">${nightsText}</div>
                                            </td>
                                        </tr>
                                        <!-- Book button — full-width, stacked below -->
                                        <tr>
                                            <td style="padding:0 16px 16px 16px;">
                                                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                                    <tbody>
                                                        <tr>
                                                            <td bgcolor="${C.forest}" align="center" style="background-color:${C.forest};">
                                                                <a href="${link}" style="display:block;padding:13px 12px;font-family:${F.poster};font-weight:800;font-size:11px;color:${C.cream};text-decoration:none;letter-spacing:0.12em;text-transform:uppercase;text-align:center;">Book on recreation.gov &rarr;</a>
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
                                <div style="font-family:${F.mono};font-size:11px;color:${C.clay};letter-spacing:0.18em;text-transform:uppercase;">${eyebrow}</div>
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
                                <div style="font-family:${F.mono};font-size:11px;color:${C.creampale};letter-spacing:0.12em;text-transform:uppercase;line-height:20px;">
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

// ── Orchestrator ──────────────────────────────────────────────────────────────

export const formatEmail = (newMatches: MatchResult[], options: FormatEmailOptions = {}): FormattedEmail => {
    const { unsubscribeUrl, email, apiSecret, siteUrl } = options;
    const unsubscribeOptions = { unsubscribeUrl, email, apiSecret };
    const count = newMatches.length;

    // Subject line
    const uniqueCampgroundNames = [...new Set(newMatches.map((m) => m.campgroundName))];
    let subject: string;
    if (count === 1) {
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
        byCampground[m.campgroundName].matches.push(m);
    }

    // Sort: favorites first within each campground
    const groupOrder: Record<string, number> = { favorites: 0, worthwhile: 1, "all-others": 2 };
    for (const name in byCampground) {
        byCampground[name].matches.sort((a, b) => groupOrder[a.group] - groupOrder[b.group]);
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

    // ── Per-campground sections ───────────────────────────────────────────────
    let openingCounter = 0;
    const campgroundSections = Object.entries(byCampground)
        .map(([name, { area, description, matches }]) => {
            const indexOfFirstOpening = openingCounter;
            openingCounter += matches.length;
            return buildCampgroundSection({ name, area, description, matches }, indexOfFirstOpening, count);
        })
        .join("\n");

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
${buildPreheader(count, uniqueCampgroundNames)}
${buildHeader(count, uniqueCampgroundNames, logoUrl)}
${buildMetaBar(timestamp)}

                    <!-- OPENINGS — one section per campground -->
                    ${campgroundSections}

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
            ...(unsubscribeLink ? { headers: { "List-Unsubscribe": `<${unsubscribeLink}>` } } : {}),
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
