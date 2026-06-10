# Send-To Address for Alert Emails

**Date:** 2026-06-10
**Status:** Approved

## Problem

Alerts are delivered to the login (Google) email. Phone notification speed depends on the receiving app: Apple Mail only pushes iCloud addresses, the Gmail app only pushes Gmail. Users need to route alerts to whichever inbox their phone pushes natively — without changing their login identity, which is the primary key for all stored data.

## Decision summary

- Login stays Google; identity and all KV keys remain the login email.
- New optional **`notificationEmail`** (verified, in-effect delivery address) and **`pendingNotificationEmail`** on `UserProfile`. Absent `notificationEmail` ⇒ deliver to login email (sparse default, like `checkPriority`).
- **Verify-before-use:** a custom address only takes effect after its owner clicks a confirmation link. Closes both the typo black-hole and the point-alerts-at-a-stranger abuse hole.
- **Stateless verification:** the link carries `HMAC-SHA256(accountEmail + "|" + newAddress)` signed with the existing `SUBSCRIBER_API_SECRET` (already in the next app env, same pattern as the notifier's unsubscribe tokens). No codes, no expiry storage. A stale link for a no-longer-pending address still verifies that address — self-contained consent, harmless.

## Flows

**Set:** Account page → "Alert delivery" field (defaults to login email) → save a different address → PATCH `/api/me` stores it as `pendingNotificationEmail` (validated: trimmed, lowercased, basic email-shape regex, must differ from login email) and sends a verification email to the new address. `notificationEmail` is untouched; alerts keep flowing to the current effective address.

**Verify:** `GET /api/me/verify-notification-email?account=<loginEmail>&address=<newAddress>&token=<hmac>` → recompute HMAC, constant-time compare → on match: set `notificationEmail = address`, clear `pendingNotificationEmail` → redirect to `/app/account?emailVerified=1` (account page shows a success banner). Invalid/tampered token → 400.

**Reset:** saving an empty field or the login email itself clears both fields (back to default). Re-saving a new address replaces pending and re-sends.

**Deliver:** notifier `sendEmailToUser` addresses `target.notificationEmail ?? target.email`. The unsubscribe link continues to use the **account** email (identity key; existing HMAC behavior unchanged). The notification-targets endpoint passes `notificationEmail` through.

## UI (account page, next to the existing notification settings)

- Field labeled "Send alerts to", placeholder/default = login email; shows current effective address.
- Blurb (the why): "Alerts go to your login email unless you point them somewhere faster. Tip: your phone gets instant push for iCloud addresses in Apple Mail, and for Gmail addresses in the Gmail app — pick whichever inbox buzzes."
- Pending state: "Verification sent to {pending} — alerts keep going to {effective} until you confirm." + Resend button + "Use login email" reset.
- `?emailVerified=1` query param → success banner.

## Verification email

Sent via Resend from the next app (new: `RESEND_API_KEY` secret added to the next Worker env — `wrangler secret put` piped via `printf '%s'`, never echo). Simple branded message: "Confirm where CampWatch sends your alerts" + button to the verify URL. From the same sender domain as alert emails.

## Validation & security

- Email-shape regex + trim/lowercase on input; reject addresses over 254 chars.
- HMAC uses `SUBSCRIBER_API_SECRET`; comparison is constant-time (`crypto.timingSafeEqual` equivalent available in Workers runtime via `crypto.subtle` or manual constant-time compare).
- Verification route is unauthenticated by design (recipient may not be signed in) — the token is the authorization.
- Resend frequency: re-saving re-sends; no rate limit beyond Resend's own (acceptable for this user base; revisit if abused).

## Testing

- `/api/me` PATCH: custom address lands in pending (not live); login-email/empty resets both; invalid shape → 400.
- Verify route: valid token promotes pending→live and redirects; tampered token → 400; token for non-pending address still sets it.
- Notifier: target with `notificationEmail` gets mail addressed there; unsubscribe link still carries the account email; target without it unchanged.
- Targets endpoint passes the field through.

## Out of scope

- Sign in with Apple (parked; trigger = native iOS app or real Apple-only signup demand).
- Changing login identity / KV key migration.
- Per-campground delivery addresses.
- Rate limiting verification sends.
