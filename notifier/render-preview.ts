// Renders a sample email to email-preview.html for visual inspection.
// Usage: npx tsx render-preview.ts

import { writeFileSync } from "node:fs";
import { formatEmail } from "./lib/email";
import type { MatchResult } from "./lib/diff";

const SAMPLE_MATCHES: MatchResult[] = [
    // Outlet Campground — two sites
    {
        campgroundName: "Outlet Campground",
        campgroundArea: "Payette National Forest",
        campgroundDescription: "",
        campgroundId: "cg-outlet",
        siteName: "Site 015",
        siteId: "10001",
        group: "favorites",
        match: { from: "2026-05-23", to: "2026-05-25", nights: 2 },
    },
    {
        campgroundName: "Outlet Campground",
        campgroundArea: "Payette National Forest",
        campgroundDescription: "",
        campgroundId: "cg-outlet",
        siteName: "Site 007",
        siteId: "10002",
        group: "worthwhile",
        match: { from: "2026-05-30", to: "2026-06-01", nights: 2 },
    },
    // Pine Flats — one site
    {
        campgroundName: "Pine Flats Campground",
        campgroundArea: "Boise National Forest",
        campgroundDescription: "",
        campgroundId: "cg-pineflats",
        siteName: "Site 008",
        siteId: "10003",
        group: "favorites",
        match: { from: "2026-06-06", to: "2026-06-07", nights: 1 },
    },
];

const { html } = formatEmail(SAMPLE_MATCHES, {
    email: "you@trail.example",
    siteUrl: "https://campwatch.dev",
    // No unsubscribeUrl / apiSecret — omit footer unsubscribe link in preview
});

// Wrap in a preview shell with mobile/desktop toggle
const preview = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CampWatch Email Preview</title>
    <style>
        body { margin: 0; background: #E8DCC8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .preview-controls {
            text-align: center;
            padding: 16px;
            font-size: 13px;
            color: #555;
            background: #D8CCBA;
            border-bottom: 1px solid #C8BCAA;
        }
        .preview-controls button {
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 6px;
            padding: 6px 16px;
            font-size: 13px;
            cursor: pointer;
            margin: 0 4px;
        }
        .preview-controls button.active {
            background: #1F3D2A;
            color: #FBF6EA;
            border-color: #1F3D2A;
        }
        .preview-frame-wrap {
            padding: 24px 16px;
            display: flex;
            justify-content: center;
        }
        .preview-frame {
            transition: max-width 0.2s ease;
        }
        /* On mobile breakpoint, force narrow */
        @media (max-width: 480px) {
            .preview-frame { max-width: 100% !important; }
        }
    </style>
</head>
<body>
    <div class="preview-controls">
        <strong>CampWatch Email Preview</strong>&nbsp;&nbsp;
        <button onclick="setWidth(375)" class="active" id="btn-mobile">iPhone (375px)</button>
        <button onclick="setWidth(640)" id="btn-desktop">Desktop (640px)</button>
    </div>
    <script>
        function setWidth(w) {
            document.getElementById('frame').style.maxWidth = w + 'px';
            document.getElementById('btn-mobile').className = w === 375 ? 'active' : '';
            document.getElementById('btn-desktop').className = w === 640 ? 'active' : '';
        }
    </script>
    <div class="preview-frame-wrap">
        <div class="preview-frame" id="frame" style="max-width:375px;width:100%;">
${html}
        </div>
    </div>
</body>
</html>`;

writeFileSync(new URL("./email-preview.html", import.meta.url), preview, "utf8");
console.log("email-preview.html written.");
