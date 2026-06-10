# Spotted Time in Alert Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each opening card in alert emails shows when the opening was first spotted — "Spotted 2:14 PM MT · 3 min before this email".

**Architecture:** `MatchResult` gains optional `firstSeenAt`; `run()` annotates each user's new matches from the existing global first-seen map right before send (the adjacent latency block already does the same lookup). A pure exported formatter in the email lib renders absolute time in `America/Boise` plus a relative bucket; `buildOpeningCard` adds the line when the field is present.

**Tech Stack:** TypeScript, Intl.DateTimeFormat (Workers-supported), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-spotted-time-design.md`

**Repo rules (campwatch):** Commit to `main`. **NEVER push or deploy without Mike's explicit OK.** Stage only files you change (leave dirty: `.gitignore`, `next/src/components/dashboard/timeline/availability-block.tsx`). Notifier has NO CI coverage — manual `cd notifier && npx tsc --noEmit && npx vitest run` before every commit, plus `npx prettier --write` on touched files (CI checks formatting repo-wide on next/ but keep notifier formatted too).

---

## File structure

| File | Change |
|---|---|
| `notifier/lib/diff.ts` | `MatchResult.firstSeenAt?: string` |
| `notifier/lib/email.ts` | Export `formatSpottedLine(firstSeenIso, nowMs)`; render it in `buildOpeningCard` |
| `notifier/lib/email.test.ts` (create) | Formatter + card-rendering units |
| `notifier/check.ts` | Annotate `newMatches` with `firstSeenAt` before send |
| `notifier/check.test.ts` | Integration: sent html contains "Spotted" |

---

### Task 1: Formatter + card rendering

**Files:**
- Modify: `notifier/lib/diff.ts` (`MatchResult`, line ~28)
- Modify: `notifier/lib/email.ts` (`buildOpeningCard`, line ~184; new exported helper above it)
- Test: `notifier/lib/email.test.ts` (create)

- [ ] **Step 1: Add the field**

In `notifier/lib/diff.ts`, add to `MatchResult` after `group`:

```ts
/** ISO timestamp of the opening's first global sighting; annotated by run() before email send. */
firstSeenAt?: string;
```

- [ ] **Step 2: Write the failing tests**

Create `notifier/lib/email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatSpottedLine, formatEmail } from "./email";
import type { MatchResult } from "./diff";

// 2026-06-10T20:14:00Z = 2:14 PM Mountain Daylight Time (UTC-6)
const FIRST_SEEN = "2026-06-10T20:14:00.000Z";

describe("formatSpottedLine", () => {
    it("renders under-a-minute freshness", () => {
        const now = new Date(FIRST_SEEN).getTime() + 40_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe(
            "Spotted 2:14 PM MT · under a minute before this email",
        );
    });

    it("renders minutes", () => {
        const now = new Date(FIRST_SEEN).getTime() + 12 * 60_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe("Spotted 2:14 PM MT · 12 min before this email");
    });

    it("renders hours and minutes", () => {
        const now = new Date(FIRST_SEEN).getTime() + (3 * 60 + 20) * 60_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe(
            "Spotted 2:14 PM MT · 3 hr 20 min before this email",
        );
    });

    it("renders days and hours with the date included", () => {
        const now = new Date(FIRST_SEEN).getTime() + (2 * 24 + 5) * 3_600_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe(
            "Spotted Jun 10, 2:14 PM MT · 2 days 5 hr before this email",
        );
    });
});

describe("opening card spotted line", () => {
    const baseMatch: MatchResult = {
        campgroundId: "232358",
        campgroundName: "Outlet",
        campgroundArea: "Stanley",
        campgroundDescription: "",
        siteId: "1",
        siteName: "Site 001",
        match: { from: "2026-07-04", to: "2026-07-06", nights: 2 },
        group: "favorites",
    };

    function render(match: MatchResult): string {
        const { html } = formatEmail({
            matches: [match],
            siteUrl: "https://campwatch.dev",
        } as never);
        return html;
    }

    it("includes the spotted line when firstSeenAt is set", () => {
        const html = render({ ...baseMatch, firstSeenAt: FIRST_SEEN });
        expect(html).toContain("Spotted");
        expect(html).toContain("2:14 PM MT");
    });

    it("omits the line when firstSeenAt is absent", () => {
        const html = render(baseMatch);
        expect(html).not.toContain("Spotted");
    });
});
```

IMPLEMENTER NOTE on the `render` helper: read `formatEmail`'s actual options shape (email.ts ~line 372: `{ unsubscribeUrl, email, apiSecret, siteUrl }` plus the matches — check the real signature and required fields) and construct a minimal valid call; the `as never` cast above is a placeholder for whatever minimal object typechecks. The two assertions are the contract; adapt the plumbing to the real signature. Also: `formatEmail` may return a string rather than `{ html }` — read it and adapt. The relative-time computation must use an injectable `nowMs` — `buildOpeningCard` should call `formatSpottedLine(match.firstSeenAt, Date.now())`; for deterministic card tests, only assert the absolute part ("2:14 PM MT") and the word "Spotted", never the relative bucket.

- [ ] **Step 3: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run lib/email.test.ts`
Expected: FAIL — `formatSpottedLine` is not exported.

- [ ] **Step 4: Implement**

In `notifier/lib/email.ts`, above `buildOpeningCard`:

```ts
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
 *  the age at send. Exported for tests; nowMs injected for determinism. */
export const formatSpottedLine = (firstSeenIso: string, nowMs: number): string => {
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
            ? `${MT_DATE_TIME.format(seen)} MT`
            : `${MT_TIME.format(seen)} MT`;
    return `Spotted ${abs} · ${rel} before this email`;
};
```

In `buildOpeningCard`, after the `nightsText` line in the card body (the `<div>` rendering `${nightsText}`), add:

```ts
const spottedHtml = match.firstSeenAt
    ? `<div style="font-family:${F.mono};font-size:12px;color:${C.inkSubtle};letter-spacing:0.08em;margin-top:6px;">${formatSpottedLine(match.firstSeenAt, Date.now())}</div>`
    : "";
```

and interpolate `${spottedHtml}` into the template directly below the nights `<div>`.

NOTE: `MT_DATE_TIME.format()` output contains a comma ("Jun 10, 2:14 PM") — the day-old test expects `"Spotted Jun 10, 2:14 PM MT · ..."`. `Intl` may render with U+202F narrow no-break space before AM/PM in some ICU versions; if the tests fail on whitespace, normalize in the formatter: `.replace(/ | /g, " ")` after `.format()`.

- [ ] **Step 5: Run to verify pass**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run lib/email.test.ts && npx tsc --noEmit`
Expected: 6 tests PASS, clean.

- [ ] **Step 6: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch && npx prettier --write notifier/lib/email.ts notifier/lib/email.test.ts notifier/lib/diff.ts
git add notifier/lib/email.ts notifier/lib/email.test.ts notifier/lib/diff.ts
git commit -m "feat: spotted-time line in alert email opening cards"
```

---

### Task 2: Annotate matches in run()

**Files:**
- Modify: `notifier/check.ts` (the send block in `run()`, ~line 702-716: the `if (dryRun) ... else { ... await sendEmailToUser(...) }` block)
- Test: `notifier/check.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `notifier/check.test.ts` (module-level helpers `tierTarget`/`tierCampground`/`mockFetch`/`stubKv` exist; mirror the "delivery address override" test's real-send setup):

```ts
describe("spotted time in sent emails", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("annotates matches so the sent html contains the Spotted line", async () => {
        const target = {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            notifierState: { sites: {} }, // not first run → email branch reachable
        };
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch([target]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: stubKv(),
            now: new Date("2026-07-06T00:00:00Z"),
        });

        const resendCalls = fetchSpy.mock.calls.filter((c) =>
            String(c[0]).includes("api.resend.com"),
        );
        expect(resendCalls.length).toBeGreaterThan(0);
        const payload = JSON.parse(String(resendCalls[0]![1]?.body)) as { html: string };
        expect(payload.html).toContain("Spotted");
        expect(payload.html).toContain("MT ·");
    });
});
```

(The first-seen map assigns `now.toISOString()` to brand-new signatures via the mocked `/api/admin/first-seen` GET returning `{}`, so `firstSeenAt` is always populated for this fixture.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run check.test.ts`
Expected: the new test FAILS (html lacks "Spotted"); all pre-existing tests pass.

- [ ] **Step 3: Implement the annotation**

In `notifier/check.ts`, in the send block — directly above the `if (dryRun)` line (so both branches see annotated matches), add:

```ts
// Stamp each match with its global first-sighting so the email can say how
// long the opening has been visible (same lookup the latency stats use below).
for (const m of newMatches) {
    m.firstSeenAt = newFirstSeenMap[signatureForMatch(m)];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run && npx tsc --noEmit`
Expected: ALL tests pass (33 incl. new), clean.

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch && npx prettier --write notifier/check.ts notifier/check.test.ts
git add notifier/check.ts notifier/check.test.ts
git commit -m "feat: annotate matches with first-seen time before email send"
```

---

### Task 3: Verification + gated deploy

- [ ] **Step 1: Full check**

```bash
cd /Users/mikeroberts/Code/campwatch/notifier && npx tsc --noEmit && npx vitest run
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run format:check
```

(next is untouched but the shared types in notifier/lib are imported nowhere in next — the run is cross-import insurance.)

- [ ] **Step 2: Optional visual check**

`notifier/render-preview.ts` renders a sample email to `notifier/email-preview.html` — if it accepts the match fixture easily, regenerate and eyeball the card. Don't fight it if the script needs surgery; the unit tests cover the contract.

- [ ] **Step 3: STOP — deploy needs Mike's OK**

Notifier-only feature. After approval: commit history pushed (`git push` — next app redeploys harmlessly) and `cd notifier && npx wrangler deploy` with the personal-account env (`set -a && source ../.campwatch-personal-cf.env && set +a`, verify `wrangler whoami` shows Mikeroberts421 first).

---

## Self-review notes

- **Spec coverage:** field + annotation (T2), formatter buckets + MT rendering + omission-when-absent (T1), integration real-send assertion (T2), out-of-scope items absent.
- **Type consistency:** `firstSeenAt` (diff.ts) = field annotated in check.ts = field read in buildOpeningCard; `formatSpottedLine(firstSeenIso, nowMs)` defined and tested in T1.
- **Judgment calls:** absolute time drops the date for <24h-old sightings (the common case), includes it at ≥1 day; relative buckets per spec; `Date.now()` at render time = send time (matches the latency stat's clock).
