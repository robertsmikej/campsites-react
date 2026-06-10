# Spotted Time in Alert Emails

**Date:** 2026-06-10
**Status:** Approved

## Problem

Alert emails say what opened but not when it appeared. Knowing how long an opening has been visible (and when it was detected, for reading the email later) is real decision input — a 2-day-old opening is far more likely to be gone than a 40-second-old one.

## Decision summary

- Source of truth: the notifier's existing **global first-seen map** (signature → ISO timestamp), already maintained for the lead-time filter and latency stats. No new tracking.
- `MatchResult` gains optional `firstSeenAt?: string`; `run()` annotates each user's new matches from the map just before email send. Missing value (defensive) → the line is omitted.
- Each opening card renders: **"Spotted 2:14 PM MT · 3 min before this email"** — absolute (`America/Boise`, labeled MT) + relative-at-send.
- Relative buckets: `under a minute`, `N min`, `N hr M min`, `N day(s) H hr`. Computed against the send-time clock.
- Pure exported formatter (`formatSpottedLine(firstSeenIso, nowMs)` or equivalent) in the email lib for unit testing; `Intl.DateTimeFormat` with `timeZone: "America/Boise"` (supported in Workers).
- Notifier-only change: no API, UI, or storage changes.

## Behavior notes

- High-tier curator alerts will usually read "under a minute" — a freshness badge.
- Real age shows on: re-alerts after the 24h cooldown, openings that rode out 429 windows, and non-curator alerts (15-min lead time).
- First-seen resets if an opening vanishes and reappears later (map only retains currently-visible signatures) — the line reflects the current sighting streak, which is the decision-relevant number.

## Testing

- Formatter units: <1 min, minutes, hours+minutes, days; MT rendering for a known timestamp.
- Card rendering: line present with `firstSeenAt`, absent without.
- Integration: real-send path (dryRun false, mocked Resend) asserts the html contains "Spotted".

## Out of scope

- Per-recipient timezone preferences (MT hardcoded — the watchlist is Idaho).
- Showing spotted-time on the dashboard/web UI.
