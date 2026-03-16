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

export const formatEmail = (newMatches, options = {}) => {
    const { unsubscribeUrl, email, apiSecret, siteUrl } = options;
    const unsubscribeOptions = { unsubscribeUrl, email, apiSecret };
    const count = newMatches.length;
    // Subject line — show campground names so it's easy to scan
    const uniqueCampgroundNames = [...new Set(newMatches.map((m) => m.campgroundName))];
    let subject;
    if (count === 1) {
        subject = `1 new: ${uniqueCampgroundNames[0]}`;
    } else {
        subject = `${count} new: ${uniqueCampgroundNames.join(', ')}`;
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

    // Build HTML
    const campgroundSections = Object.entries(byCampground)
        .map(([name, { area, description, matches }]) => {
            const rows = matches
                .map((m) => {
                    const link = buildReservationLink(m.siteId, m.match.from, m.match.nights);
                    return `<tr>
                        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                            <strong>${m.siteName.replace(/^Site\s+/i, '')}</strong>
                        </td>
                        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                            ${formatDate(m.match.from)} &rarr; ${formatDate(m.match.to)}
                        </td>
                        <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:center;">
                            ${m.match.nights}
                        </td>
                        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                            <a href="${link}" style="color:#2563eb;text-decoration:none;">Book&nbsp;&rarr;</a>
                        </td>
                    </tr>`;
                })
                .join('\n');

            return `
                <div style="margin-bottom:24px;">
                    <h2 style="margin:0 0 4px 0;font-size:18px;color:#111;">${name}</h2>${description ? `
                    <p style="margin:0 0 4px 0;font-size:13px;color:#374151;">${description}</p>` : ''}
                    <p style="margin:0 0 12px 0;font-size:12px;color:#9ca3af;">${area}</p>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead>
                            <tr style="background:#f9fafb;">
                                <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Site</th>
                                <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Dates</th>
                                <th style="padding:6px 4px;text-align:center;border-bottom:2px solid #e5e7eb;">&#127769;</th>
                                <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>`;
        })
        .join('\n');

    const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Boise',
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    // Build unsubscribe link if options provided
    let unsubscribeHtml = '';
    let unsubscribeLink = '';
    if (unsubscribeOptions.unsubscribeUrl && unsubscribeOptions.email && unsubscribeOptions.apiSecret) {
        const token = generateUnsubscribeToken(unsubscribeOptions.email, unsubscribeOptions.apiSecret);
        unsubscribeLink = `${unsubscribeOptions.unsubscribeUrl}?email=${encodeURIComponent(unsubscribeOptions.email)}&token=${token}`;
        unsubscribeHtml = ` &middot; <a href="${unsubscribeLink}" style="color:#9ca3af;">Unsubscribe</a>`;
    }

    const logoUrl = siteUrl ? `${siteUrl}/images/logos/CampWatch_Logo_trimmed_small.png` : '';
    const logoHtml = logoUrl
        ? `<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr>
            <td style="vertical-align:middle;"><img src="${logoUrl}" alt="CampWatch" height="32" style="height:32px;width:auto;" /></td>
            <td style="vertical-align:middle;padding-left:8px;"><span style="font-size:22px;font-weight:700;color:#166534;letter-spacing:-0.5px;">CampWatch</span></td>
           </tr></table>`
        : '<p style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#166534;letter-spacing:-0.5px;">CampWatch</p>';

    const viewAllHtml = siteUrl
        ? `<div style="text-align:center;margin:20px 0;">
            <a href="${siteUrl}" style="display:inline-block;background:#166534;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">View all availability &rarr;</a>
           </div>`
        : '';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111;">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px;">
        ${logoHtml}
        <h1 style="margin:0;font-size:20px;color:#166534;">
            ${count} New Campsite${count === 1 ? '' : 's'} Available
        </h1>
        <p style="margin:4px 0 0 0;font-size:13px;color:#6b7280;">Checked at ${timestamp} (MST)</p>
    </div>
    ${campgroundSections}
    ${viewAllHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="font-size:12px;color:#9ca3af;text-align:center;">
        CampWatch &middot; Notifications sent when new openings are detected${unsubscribeHtml}
    </p>
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
            from: 'CampWatch <campwatch@robertsmj.com>',
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
