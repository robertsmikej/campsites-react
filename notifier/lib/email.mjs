// Email formatting and sending via Resend API.
// No dependencies — uses native fetch and Node crypto.

import { createHmac } from 'node:crypto';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Generate HMAC token matching the CF Worker's implementation
const generateUnsubscribeToken = (email, secret) => {
    return createHmac('sha256', secret).update(email).digest('hex');
};

const formatDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = DAY_NAMES[date.getUTCDay()];
    const month = MONTH_NAMES[date.getUTCMonth()];
    return `${day} ${month} ${date.getUTCDate()}`;
};

const buildReservationLink = (siteId, fromDate, nights) => {
    const from = new Date(fromDate);
    const to = new Date(from);
    to.setDate(from.getDate() + nights);
    const arrival = from.toISOString().split('T')[0];
    const departure = to.toISOString().split('T')[0];
    return `https://www.recreation.gov/camping/campsites/${siteId}?arrivalDate=${arrival}&departureDate=${departure}`;
};

// ── Palette (hex literals — email clients don't support CSS variables) ──────
const C = {
    paper:       '#F4EAD8',
    cream:       '#FBF6EA',
    ink:         '#1A1614',
    inkSoft:     'rgba(26,22,20,0.70)',
    inkFaint:    'rgba(26,22,20,0.50)',
    rule:        'rgba(26,22,20,0.18)',
    forest:      '#1F3D2A',
    clay:        '#B65C3F',
    mustard:     '#C9A227',
};

// ── Type stacks ──────────────────────────────────────────────────────────────
const F = {
    poster:  '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
    serif:   'Georgia, "Times New Roman", serif',
    mono:    '"Courier New", Courier, monospace',
};

export const formatEmail = (newMatches, options = {}) => {
    const { unsubscribeUrl, email, apiSecret, siteUrl } = options;
    const unsubscribeOptions = { unsubscribeUrl, email, apiSecret };
    const count = newMatches.length;

    // Subject line — show campground names so it's easy to scan
    const uniqueCampgroundNames = [...new Set(newMatches.map((m) => m.campgroundName))];
    let subject;
    if (count === 1) {
        subject = `1 new opening · ${uniqueCampgroundNames[0]}`;
    } else {
        subject = `${count} new openings · ${uniqueCampgroundNames.join(', ')}`;
    }

    // Group by campground
    const byCampground = {};
    for (const m of newMatches) {
        if (!byCampground[m.campgroundName]) {
            byCampground[m.campgroundName] = { area: m.campgroundArea, description: m.campgroundDescription, matches: [] };
        }
        byCampground[m.campgroundName].matches.push(m);
    }

    // Sort: favorites first within each campground
    const groupOrder = { favorites: 0, worthwhile: 1, 'all-others': 2 };
    for (const name in byCampground) {
        byCampground[name].matches.sort((a, b) => groupOrder[a.group] - groupOrder[b.group]);
    }

    // ── Header headline ──────────────────────────────────────────────────────
    // e.g. "2 OPENINGS — OUTLET, PINE FLATS"
    const shortNames = uniqueCampgroundNames
        .map((n) => n.replace(/\s+campground$/i, '').toUpperCase())
        .join(', ');
    const headlineCount = `${count} OPENING${count === 1 ? '' : 'S'}`;
    const italicLine = count === 1
        ? `Hello &mdash; one new opening this morning.`
        : `Hello &mdash; ${count} new openings this morning.`;

    // ── Timestamp ────────────────────────────────────────────────────────────
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
        timeZone: 'America/Boise',
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    // Compact date for the envelope header (MM.DD.YYYY)
    const dateStamp = now.toLocaleDateString('en-US', {
        timeZone: 'America/Boise',
        month: '2-digit',
        day:   '2-digit',
        year:  'numeric',
    }).replace(/\//g, '.');
    const timeStamp = now.toLocaleTimeString('en-US', {
        timeZone: 'America/Boise',
        hour:   'numeric',
        minute: '2-digit',
        hour12: true,
    }).replace(' ', '&nbsp;') + '&nbsp;MDT';

    // ── Build unsubscribe link ────────────────────────────────────────────────
    let unsubscribeHtml = '';
    let unsubscribeLink = '';
    if (unsubscribeOptions.unsubscribeUrl && unsubscribeOptions.email && unsubscribeOptions.apiSecret) {
        const token = generateUnsubscribeToken(unsubscribeOptions.email, unsubscribeOptions.apiSecret);
        unsubscribeLink = `${unsubscribeOptions.unsubscribeUrl}?email=${encodeURIComponent(unsubscribeOptions.email)}&token=${token}`;
        unsubscribeHtml = `&nbsp;&middot;&nbsp;<a href="${unsubscribeLink}" style="color:${C.forest};text-decoration:underline;font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Unsubscribe</a>`;
    }

    // ── Logo / wordmark ───────────────────────────────────────────────────────
    const logoUrl = siteUrl ? `${siteUrl}/images/logos/CampWatch_Logo_trimmed_small.png` : '';

    // ── Per-campground sections ───────────────────────────────────────────────
    const campgroundSections = Object.entries(byCampground)
        .map(([name, { area, matches }], cgIdx) => {
            // Section header: campground name + area
            const sectionHeader = `
                <tr>
                    <td colspan="2" style="padding:${cgIdx === 0 ? '0' : '16px'} 0 8px 0;">
                        <div style="font-family:${F.poster};font-size:13px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;color:${C.ink};margin:0 0 1px 0;">${name}</div>
                        ${area ? `<div style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.inkFaint};margin:0;">${area}</div>` : ''}
                    </td>
                </tr>`;

            const rows = matches
                .map((m) => {
                    const link = buildReservationLink(m.siteId, m.match.from, m.match.nights);
                    const siteName = m.siteName.replace(/^Site\s+/i, '');
                    const nightWord = m.match.nights === 1 ? 'night' : 'nights';
                    const dateRange = `${formatDate(m.match.from)} &ndash; ${formatDate(m.match.to)} &middot; ${m.match.nights}&nbsp;${nightWord}`;

                    return `
                <tr>
                    <td colspan="2" style="border-top:1px dashed ${C.rule};padding:10px 0 10px 0;">
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                            <tr>
                                <td style="vertical-align:top;">
                                    <div style="font-family:${F.serif};font-size:15px;font-weight:700;color:${C.ink};line-height:1.2;margin:0 0 3px 0;">${name} &middot; Site&nbsp;${siteName}</div>
                                    <div style="font-family:${F.serif};font-style:italic;font-size:13px;font-weight:500;color:${C.inkSoft};line-height:1.4;margin:0 0 6px 0;">${dateRange}</div>
                                    <a href="${link}" style="font-family:${F.serif};font-size:13px;font-weight:700;color:${C.forest};text-decoration:underline;display:inline-block;">Book on rec.gov &rarr;</a>
                                </td>
                                <td style="vertical-align:top;text-align:right;padding-left:8px;white-space:nowrap;">
                                    <span style="font-family:${F.mono};font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.clay};border:1px solid ${C.clay};padding:3px 5px;display:inline-block;line-height:1;">NEW</span>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>`;
                })
                .join('\n');

            return `${sectionHeader}${rows}`;
        })
        .join('\n');

    // ── View all button ───────────────────────────────────────────────────────
    const viewAllHtml = siteUrl
        ? `
                <tr>
                    <td colspan="2" style="padding:20px 0 0 0;text-align:center;">
                        <a href="${siteUrl}" style="display:inline-block;background:${C.forest};color:${C.cream};font-family:${F.mono};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;padding:10px 24px;">View All Availability &rarr;</a>
                    </td>
                </tr>`
        : '';

    // ── Footer sign-off ───────────────────────────────────────────────────────
    const footerSignoff = `
                <tr>
                    <td colspan="2" style="border-top:1px dashed ${C.rule};padding:14px 0 0 0;">
                        <div style="font-family:${F.serif};font-style:italic;font-size:13px;font-weight:400;color:${C.inkSoft};line-height:1.5;margin:0 0 2px 0;">Yours from the trail,</div>
                        <div style="font-family:${F.serif};font-style:italic;font-size:20px;font-weight:600;color:${C.clay};line-height:1.2;">&mdash;&nbsp;CampWatch</div>
                    </td>
                </tr>`;

    // ── Footer meta (timestamp + unsubscribe) ─────────────────────────────────
    const footerMeta = `
                <tr>
                    <td colspan="2" style="border-top:1px solid ${C.rule};padding:16px 0 0 0;text-align:center;">
                        <span style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.inkFaint};">Checked at ${timestamp} (MST)${unsubscribeHtml}</span>
                    </td>
                </tr>`;

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
        <td align="center" style="padding:32px 16px 32px 16px;">

            <!-- Content card — 640px max -->
            <table cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;width:100%;background-color:${C.cream};border:1.5px solid ${C.ink};">
                <tr>
                    <td style="padding:32px 36px 32px 36px;">

                        <!-- Inner layout table -->
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">

                            <!-- ── Envelope header ── -->
                            <tr>
                                <td colspan="2" style="border-bottom:1px solid ${C.rule};padding-bottom:14px;margin-bottom:16px;">
                                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                                        <tr>
                                            <!-- FROM/TO block -->
                                            <td style="vertical-align:top;">
                                                ${logoUrl
                                                    ? `<img src="${logoUrl}" alt="CampWatch" height="28" style="height:28px;width:auto;display:block;margin-bottom:8px;" />`
                                                    : ''}
                                                <div style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.inkSoft};line-height:1.6;">FROM</div>
                                                <div style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;color:${C.ink};line-height:1.6;margin-bottom:6px;">CampWatch &lt;alerts@campwatch.dev&gt;</div>
                                                <div style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.inkSoft};line-height:1.6;">TO</div>
                                                <div style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;color:${C.ink};line-height:1.6;">${email ? email : 'you@trail.example'}</div>
                                            </td>
                                            <!-- Date stamp -->
                                            <td style="vertical-align:top;text-align:right;">
                                                <div style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.inkSoft};line-height:1.6;text-align:right;">${dateStamp}</div>
                                                <div style="font-family:${F.mono};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.inkSoft};line-height:1.6;text-align:right;">${timeStamp}</div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- ── Poster headline ── -->
                            <tr>
                                <td colspan="2" style="padding-top:16px;padding-bottom:4px;">
                                    <div style="font-family:${F.poster};font-size:26px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;line-height:1.1;color:${C.ink};margin:0 0 8px 0;">
                                        <span style="color:${C.clay};">${headlineCount}</span>&nbsp;&mdash;&nbsp;${shortNames}
                                    </div>
                                    <div style="font-family:${F.serif};font-style:italic;font-size:17px;font-weight:500;color:${C.inkSoft};line-height:1.4;margin:0 0 16px 0;">${italicLine}</div>
                                </td>
                            </tr>

                            <!-- ── Per-campground opening rows ── -->
                            ${campgroundSections}

                            <!-- ── View all button ── -->
                            ${viewAllHtml}

                            <!-- ── Sign-off ── -->
                            <tr><td colspan="2" style="padding-top:20px;"></td></tr>
                            ${footerSignoff}

                            <!-- ── Footer meta ── -->
                            ${footerMeta}

                        </table>
                    </td>
                </tr>
            </table>

        </td>
    </tr>
</table>

</body>
</html>`;

    return { subject, html, unsubscribeLink };
};

export const sendEmail = async (to, subject, html, apiKey, unsubscribeLink = '') => {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'CampWatch <alerts@campwatch.dev>',
            reply_to: 'hello@campwatch.dev',
            to: [to],
            subject,
            html,
            ...(unsubscribeLink ? { headers: { 'List-Unsubscribe': `<${unsubscribeLink}>` } } : {}),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Email] Sent to ${to}, id: ${result.id}`);
    return result;
};
