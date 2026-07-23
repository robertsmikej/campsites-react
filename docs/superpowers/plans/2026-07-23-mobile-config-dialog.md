# Mobile Config-Dialog Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the configure-campgrounds dialog fully usable on phones (full-screen below `sm`, everything reachable, Save always visible) while leaving desktop pixel-identical, per `docs/superpowers/specs/2026-07-23-mobile-config-dialog-design.md`.

**Architecture:** Pure layout pass on `next/src/components/site-config-dialog/*`. All state stays lifted in `index.tsx`; changes are responsive Tailwind classes (mobile-first, `sm:` restores the current desktop look), one small history-integration effect for back-swipe, and a tiny extracted `StartFreshConfirm` so the confirm dialog can render from two places.

**Tech Stack:** Next.js app router, Tailwind v4 (default `sm` = 640px), shadcn/ui + Radix Dialog, `cw-*` CSS-var tokens (`CW` from `@/components/field-notes/cw-tokens`), Vitest + happy-dom colocated tests.

## Global Constraints

- Desktop (>= `sm`, 640px) must be VISUALLY UNCHANGED. Every mobile change is the base style with `sm:` restoring today's exact values. When moving a fixed inline `style` value to classes, the `sm:` class must reproduce the current value exactly (e.g. `padding: "24px 30px 20px"` becomes `p-4 sm:px-[30px] sm:pt-6 sm:pb-5`).
- Inline `style` props cannot be responsive; any value that differs between mobile and desktop MUST move to Tailwind classes (arbitrary values with CSS vars are fine: `sm:border-[1.5px] sm:border-[var(--cw-ink)]`).
- No data-flow, prop, or save-logic changes. `SiteConfigDialogProps` is untouched.
- No em dashes in new code comments or copy.
- next/ commands: `pnpm vitest run <path>`, `pnpm tsc --noEmit` (no NEW errors), `pnpm lint`, `pnpm format` before each commit. Known full-suite baseline: 11 pre-existing failures in `use-dashboard-prefs.test.ts` and `summer-plan.test.tsx` only.
- Branch: `mobile-config-cleanup`. Commit per task, no push.

---

### Task 1: Full-screen shell + back-swipe history integration

**Files:**
- Modify: `next/src/components/site-config-dialog/index.tsx` (DialogContent classes ~line 290; new effect near the other effects ~line 135)
- Test: `next/src/components/site-config-dialog/index.test.tsx` (create)

**Interfaces:**
- Consumes: existing `SiteConfigDialog` props (`open`, `onClose`, ...).
- Produces: no new exports. Behavior contract for later tasks: below 640px the dialog is full-screen; at `sm+` it is the exact current floating card. History entry `{ cwConfigDialog: true }` is pushed when the dialog opens on a narrow viewport and popped/cleaned on close.

- [ ] **Step 1: Write the failing tests**

Create `next/src/components/site-config-dialog/index.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SiteConfigDialog } from "./index";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

const baseProps = {
    onSave: vi.fn(),
    onAddDefaults: vi.fn(),
    onStartFresh: vi.fn(),
    initialData: { "recreation.gov": [] } as SiteConfig,
    globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] } as GlobalSettings,
    availableSites: {},
    useMockData: false,
    onToggleMockData: vi.fn(),
    focusedCampgroundId: null,
};

function mockMatchMedia(matches: boolean) {
    vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
            matches,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            onchange: null,
            dispatchEvent: vi.fn(),
        })),
    );
}

describe("SiteConfigDialog mobile history integration", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("pushes a history entry when opened on a narrow viewport", () => {
        mockMatchMedia(true);
        const pushSpy = vi.spyOn(window.history, "pushState");
        render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        expect(pushSpy).toHaveBeenCalledWith({ cwConfigDialog: true }, "");
    });

    it("does not touch history on a desktop viewport", () => {
        mockMatchMedia(false);
        const pushSpy = vi.spyOn(window.history, "pushState");
        render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        expect(pushSpy).not.toHaveBeenCalled();
    });

    it("closes via onClose when the user swipes back (popstate)", () => {
        mockMatchMedia(true);
        const onClose = vi.fn();
        render(<SiteConfigDialog {...baseProps} open onClose={onClose} />);
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
        expect(onClose).toHaveBeenCalled();
    });

    it("pops its own history entry when closed by button (unmount/open=false)", () => {
        mockMatchMedia(true);
        const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
        vi.spyOn(window.history, "pushState").mockImplementation(function (
            this: History,
            state: unknown,
        ) {
            // happy-dom pushState may not update history.state; emulate it.
            Object.defineProperty(window.history, "state", { value: state, configurable: true });
        });
        const { rerender } = render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        rerender(<SiteConfigDialog {...baseProps} open={false} onClose={vi.fn()} />);
        expect(backSpy).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd next && pnpm vitest run src/components/site-config-dialog/index.test.tsx`
Expected: FAIL (no pushState calls; popstate does nothing).

- [ ] **Step 3: Implement the shell + history effect**

In `index.tsx`:

1. Change the `DialogContent` (line ~290). The border and drop shadow move from inline `style` to `sm:`-gated classes; background stays inline (same both sizes):

```tsx
            <DialogContent
                showCloseButton={false}
                className="flex h-dvh max-h-dvh w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0 shadow-none sm:h-auto sm:max-h-[90vh] sm:w-[95vw] sm:max-w-6xl sm:border-[1.5px] sm:border-[var(--cw-ink)] sm:shadow-[10px_12px_0_var(--cw-forest),0_40px_90px_-30px_rgba(20,15,12,0.8)]"
                style={{ background: CW.paper }}
            >
```

Note: the current `max-w-[95vw]` is redundant with `w-[95vw]` and is dropped; `sm:w-[95vw] sm:max-w-6xl` reproduces today's desktop sizing exactly. The shadcn `DialogContent` primitive centers with translate at all sizes; full-screen `h-dvh w-screen` at `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` still fills the viewport exactly, so no primitive change is needed.

2. Add the back-swipe effect after the existing "Reset state when dialog opens" effect (~line 151). `onClose` goes through a ref so an inline arrow prop can't re-run the effect and double-push:

```tsx
    // Mobile back-swipe: the full-screen dialog owns a history entry so the
    // phone's back gesture (or back button) closes it instead of leaving the
    // page. Mirrors mobile-timeline's detail-screen pattern. onClose is read
    // through a ref so a new inline callback identity can't re-run the effect
    // and push duplicate entries.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const ownsHistoryEntry = useRef(false);
    useEffect(() => {
        if (!open) return;
        if (typeof window === "undefined") return;
        if (!window.matchMedia("(max-width: 639px)").matches) return;
        window.history.pushState({ cwConfigDialog: true }, "");
        ownsHistoryEntry.current = true;
        const onPop = () => {
            ownsHistoryEntry.current = false;
            onCloseRef.current();
        };
        window.addEventListener("popstate", onPop);
        return () => {
            window.removeEventListener("popstate", onPop);
            if (
                ownsHistoryEntry.current &&
                (window.history.state as { cwConfigDialog?: boolean } | null)?.cwConfigDialog
            ) {
                // Closed by a button while our entry is still on top: unwind it
                // so the stack stays consistent.
                ownsHistoryEntry.current = false;
                window.history.back();
            }
        };
    }, [open]);
```

(`useRef` is already imported at line 3.)

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd next && pnpm vitest run src/components/site-config-dialog/index.test.tsx && pnpm tsc --noEmit`
Expected: PASS; no new tsc errors. If happy-dom's Radix Dialog rendering needs `// @vitest-environment happy-dom` or a `ResizeObserver` stub, copy the stub pattern used by `next/src/components/dashboard/trips-card/trips-card.test.tsx` or `timeline.test.tsx` (check those files) rather than inventing one.

- [ ] **Step 5: Format + commit**

```bash
cd next && pnpm format
git add src/components/site-config-dialog/index.tsx src/components/site-config-dialog/index.test.tsx
git commit -m "Config dialog: full-screen on mobile with back-swipe close"
```

---

### Task 2: Compact masthead, sticky Save bar, in-body rare actions, hidden view toggle

**Files:**
- Modify: `next/src/components/site-config-dialog/index.tsx` (masthead ~299-351, body padding ~353, add-row ~368-382, footer ~472-561)
- Test: extend `next/src/components/site-config-dialog/index.test.tsx`

**Interfaces:**
- Consumes: Task 1's shell.
- Produces: a local `StartFreshConfirm` component inside `index.tsx` (not exported): `function StartFreshConfirm({ onStartFresh, trigger }: { onStartFresh: () => void; trigger: React.ReactNode })`.

- [ ] **Step 1: Write the failing tests**

Append to `index.test.tsx`:

```tsx
describe("SiteConfigDialog mobile layout wiring", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockMatchMedia(false);
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("renders the rare actions twice: desktop footer and mobile in-body block", () => {
        const { getAllByRole } = render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        expect(getAllByRole("button", { name: /add the curator's picks/i })).toHaveLength(2);
        expect(getAllByRole("button", { name: /start fresh/i })).toHaveLength(2);
    });

    it("hides the Cards/List toggle below sm via classes", () => {
        const { getByRole } = render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        const tablist = getByRole("tablist");
        expect(tablist.closest(".hidden.sm\\:block")).not.toBeNull();
    });

    it("both Start fresh buttons open the same confirm and fire onStartFresh", async () => {
        const onStartFresh = vi.fn();
        const { getAllByRole, findByRole } = render(
            <SiteConfigDialog {...baseProps} open onClose={vi.fn()} onStartFresh={onStartFresh} />,
        );
        const buttons = getAllByRole("button", { name: /start fresh/i });
        buttons[1]!.click();
        const confirm = await findByRole("button", { name: /erase all/i });
        confirm.click();
        expect(onStartFresh).toHaveBeenCalled();
    });
});
```

(If `tablist.closest(".hidden.sm\\:block")` proves brittle with escaping, assert `tablist.parentElement?.className` contains both `hidden` and `sm:block` instead.)

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd next && pnpm vitest run src/components/site-config-dialog/index.test.tsx`
Expected: new tests FAIL (rare actions render once; toggle has no hidden wrapper).

- [ ] **Step 3: Implement**

All in `index.tsx`.

1. **Extract `StartFreshConfirm`** above `SiteConfigDialog` (module scope), moving the existing `AlertDialog` block verbatim so both call sites share it:

```tsx
// Confirm wrapper for "Start fresh", rendered from the desktop footer and the
// mobile in-body actions block.
function StartFreshConfirm({
    onStartFresh,
    trigger,
}: {
    onStartFresh: () => void;
    trigger: React.ReactNode;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Erase your whole watchlist?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This removes every campground from your list. Your notification settings stay,
                        and you can add any campground back afterward.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep them</AlertDialogCancel>
                    <AlertDialogAction onClick={onStartFresh}>Erase all</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
```

2. **Masthead** (replace the outer div's inline padding and gate the extras):

```tsx
                <div
                    className="flex items-start justify-between p-4 sm:px-[30px] sm:pb-5 sm:pt-6"
                    style={{ background: CW.cream, borderBottom: `2px solid ${CW.ink}` }}
                >
                    <div className="min-w-0">
                        <div
                            className="hidden font-mono-field font-medium uppercase sm:block"
                            style={{ fontSize: 10, letterSpacing: "0.22em", color: CW.clay }}
                        >
                            § Watchlist · Field Station Setup
                        </div>
                        <DialogTitle
                            className="font-poster text-[22px] font-black uppercase leading-none sm:mt-[9px] sm:text-[38px] sm:leading-[0.92]"
                            style={{ letterSpacing: "-0.01em" }}
                        >
                            Configure{" "}
                            <span
                                className="font-italic-serif text-[20px] italic normal-case sm:mt-[2px] sm:block sm:text-[30px] sm:leading-none"
                                style={{ color: CW.forest }}
                            >
                                campgrounds
                            </span>
                        </DialogTitle>
                        <div
                            className="hidden font-italic-serif italic sm:block"
                            style={{ fontSize: 16, lineHeight: 1.3, color: CW.inkSoft, marginTop: 7 }}
                        >
                            {campgrounds.length} place{campgrounds.length === 1 ? "" : "s"} on watch · drag to
                            reorder, tag the sites that matter.
                        </div>
                    </div>
                    {/* close button unchanged */}
```

(The title's `marginTop: 9` inline style moves to `sm:mt-[9px]`; on mobile the title sits flush.)

3. **Scroll body padding** (line ~353):

```tsx
                <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:px-[30px] sm:pb-[30px] sm:pt-6">
```

(drop the inline `style` padding.)

4. **Add row + hidden toggle** (~368):

```tsx
                    <div className="flex items-end gap-4">
                        <div className="flex-1">
                            <AddCampground ... unchanged ... />
                        </div>
                        <div className="hidden sm:block">
                            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "list")}>
                                <TabsList>
                                    <TabsTrigger value="cards">Cards</TabsTrigger>
                                    <TabsTrigger value="list">List</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>
```

(`viewMode` resets to "cards" every open, so mobile can never be stuck in list view.)

5. **Mobile in-body rare actions**: insert INSIDE the scroll body, after the cards/list blocks (after line ~469, before the body div closes):

```tsx
                    {/* Rare bulk actions live in the scroll body on mobile; the
                        sticky footer keeps only Cancel/Save. Desktop shows these
                        in the footer instead. */}
                    <div className="flex flex-col items-start gap-1 border-t border-[var(--cw-rule)] pt-3 sm:hidden">
                        <button
                            type="button"
                            onClick={onAddDefaults}
                            className="cursor-pointer rounded-[2px] px-2 py-2 font-poster text-[12px] font-extrabold uppercase tracking-[0.12em]"
                            style={{ color: CW.clay }}
                        >
                            Add the curator&apos;s picks
                        </button>
                        <StartFreshConfirm
                            onStartFresh={onStartFresh}
                            trigger={
                                <button
                                    type="button"
                                    className="cursor-pointer rounded-[2px] px-2 py-2 font-poster text-[12px] font-extrabold uppercase tracking-[0.12em]"
                                    style={{ color: CW.inkSoft }}
                                >
                                    Start fresh
                                </button>
                            }
                        />
                    </div>
```

6. **Footer** (~472): left group hidden on mobile, right group stretches, padding responsive; the footer's inline `AlertDialog` block is replaced by `StartFreshConfirm` with the existing button as `trigger`:

```tsx
                <DialogFooter
                    className="flex-row items-center justify-between gap-3 px-4 py-3 sm:justify-between sm:px-[30px] sm:py-[18px]"
                    style={{ background: CW.cream, borderTop: `2px solid ${CW.ink}`, margin: 0 }}
                >
                    <div className="hidden items-center gap-1 sm:flex sm:gap-3">
                        {/* curator button unchanged */}
                        <StartFreshConfirm
                            onStartFresh={onStartFresh}
                            trigger={/* the existing Start fresh footer button element, unchanged */}
                        />
                    </div>
                    <div className="flex w-full items-center gap-3 sm:w-auto">
                        {/* Cancel button: add className "flex-1 sm:flex-initial" to its existing classes */}
                        {/* Save button: add className "flex-1 sm:flex-initial" to its existing classes */}
                    </div>
                </DialogFooter>
```

Concretely: append ` flex-1 sm:flex-initial` to the Cancel and Save buttons' existing className strings; all their inline styles stay byte-identical.

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd next && pnpm vitest run src/components/site-config-dialog && pnpm tsc --noEmit && pnpm lint`
Expected: PASS, no new errors.

- [ ] **Step 5: Format + commit**

```bash
cd next && pnpm format
git add src/components/site-config-dialog/
git commit -m "Config dialog mobile: compact masthead, Cancel/Save bar, in-body bulk actions"
```

---

### Task 3: Campground card stacking (trigger row, basic info, dates, sites)

**Files:**
- Modify: `next/src/components/site-config-dialog/campground-editor.tsx` (trigger ~313-388, basic info ~393-469, season window ~473-486, sites ~490-548, MultiSelect popover ~203)

**Interfaces:**
- Consumes: nothing new. Produces: nothing new (pure classes).

- [ ] **Step 1: Implement (class-only changes; no behavior, so no new unit test; Task 5's viewport pass is the verification)**

1. Trigger row (~313-317):

```tsx
            <AccordionTrigger
                className="px-3 py-[15px] hover:no-underline sm:px-[18px] [&>svg]:hidden"
                asChild={false}
            >
                <div className="flex w-full items-center gap-2 sm:gap-[14px]">
```

2. Name span (~326): make it truncate on one line; font size moves to classes:

```tsx
                    <span
                        className="min-w-0 flex-1 truncate text-left font-italic-serif text-[18px] italic sm:text-[23px]"
                        style={{ color: expanded ? CW.ink : CW.inkSoft }}
                    >
```

(remove `fontSize: 23` from the inline style; keep the color logic.)

3. Tier chips (~337-342): wrap both conditionals in a mobile-hidden group:

```tsx
                    <span className="hidden items-center gap-1 sm:flex">
                        {campground.favoritesArray.length > 0 && (
                            <TierChip tier="fav" count={campground.favoritesArray.length} />
                        )}
                        {campground.worthwhileArray.length > 0 && (
                            <TierChip tier="worth" count={campground.worthwhileArray.length} />
                        )}
                    </span>
```

4. Basic info image (~455): `className="hidden w-32 shrink-0 sm:block"` on the wrapper div.

5. Season Window row (~473): `<div className="flex flex-col gap-3 sm:flex-row">`

6. Sites row (~490): `<div className="flex flex-col gap-3 sm:flex-row">`

7. MultiSelect popover width (~203): `<PopoverContent className="w-[min(16rem,calc(100vw-2rem))] p-0" align="start">`

- [ ] **Step 2: Verify no regressions**

Run: `cd next && pnpm vitest run src/components/site-config-dialog && pnpm tsc --noEmit && pnpm lint`
Expected: PASS (existing suite; these are class-only edits).

- [ ] **Step 3: Format + commit**

```bash
cd next && pnpm format
git add src/components/site-config-dialog/campground-editor.tsx
git commit -m "Config dialog mobile: stack campground editor rows, truncate card titles"
```

---

### Task 4: SegmentedControl wrap + blackout row stacking

**Files:**
- Modify: `next/src/components/site-config-dialog/field-primitives.tsx` (SegmentedControl ~63-96)
- Modify: `next/src/components/site-config-dialog/general-settings.tsx` (blackout rows ~107-160)
- Test: extend `next/src/components/site-config-dialog/field-primitives.test.tsx`

**Interfaces:**
- Consumes/produces: `SegmentedControl` keeps its exact props; only rendering changes.

- [ ] **Step 1: Write the failing test**

Look at the existing `field-primitives.test.tsx` render helpers first and match their style. Add:

```tsx
it("SegmentedControl buttons are standalone pills on mobile and joined at sm", () => {
    const { getAllByRole, container } = render(
        <SegmentedControl
            options={[
                { value: "a", label: "Alpha" },
                { value: "b", label: "Beta" },
            ]}
            value="a"
            onChange={() => {}}
        />,
    );
    const group = container.firstElementChild as HTMLElement;
    expect(group.className).toContain("flex-wrap");
    expect(group.className).toContain("sm:flex-nowrap");
    const buttons = getAllByRole("button");
    for (const b of buttons) {
        expect(b.className).toContain("border-[1.5px]");
        expect(b.className).toContain("sm:border-0");
    }
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd next && pnpm vitest run src/components/site-config-dialog/field-primitives.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement SegmentedControl**

Replace the component body (`field-primitives.tsx:63-96`). Mobile: wrapping standalone pills, each with its own full border. Desktop (`sm+`): today's joined bar, reproduced with classes instead of inline border styles:

```tsx
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
    return (
        <div className="flex flex-wrap gap-1.5 sm:inline-flex sm:flex-nowrap sm:gap-0 sm:overflow-hidden sm:rounded-[3px] sm:border-[1.5px] sm:border-[var(--cw-ink)]">
            {options.map((opt, i) => {
                const active = opt.value === value;
                const joinBorder =
                    i < options.length - 1 ? "sm:border-r-[1.5px] sm:border-r-[var(--cw-ink)]" : "";
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        disabled={opt.disabled}
                        onClick={() => onChange(opt.value)}
                        className={`cursor-pointer whitespace-nowrap rounded-[3px] border-[1.5px] border-[var(--cw-ink)] font-mono-field font-bold uppercase transition-colors sm:rounded-none sm:border-0 ${joinBorder}`}
                        style={{
                            fontSize: 11,
                            letterSpacing: "0.1em",
                            padding: "11px 15px",
                            background: active ? CW.forest : CW.cream,
                            color: active ? CW.cream : CW.inkSoft,
                            opacity: opt.disabled ? 0.45 : undefined,
                            cursor: opt.disabled ? "not-allowed" : undefined,
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
```

(The outer `border` and per-button `borderRight` inline styles are gone; classes reproduce them at `sm+`. Callers pass no className, so no call-site changes.)

- [ ] **Step 4: Implement blackout row stacking**

In `general-settings.tsx`, replace the row wrapper (~107-160) so dates sit on line 1 and label + delete on line 2 on mobile, single row at `sm+`:

```tsx
                        {blackoutDates.map((b, i) => (
                            <div key={i} className="mb-2 flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                                    <input
                                        type="date"
                                        ... from input unchanged, but className gains min-w-0 flex-1 sm:flex-initial ...
                                    />
                                    <span className="text-xs">→</span>
                                    <input
                                        type="date"
                                        ... to input unchanged, same className addition ...
                                    />
                                </div>
                                <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:w-auto">
                                    <input
                                        type="text"
                                        ... label input unchanged (already min-w-0 flex-1) ...
                                    />
                                    <Button ... delete button unchanged ... />
                                </div>
                            </div>
                        ))}
```

Concretely: keep every input/Button element and handler byte-identical; only the wrapping divs and the two date inputs' className (`rounded border bg-cw-cream px-2 py-1 text-sm` gains `min-w-0 flex-1 sm:flex-initial`) change.

- [ ] **Step 5: Run tests, verify pass**

Run: `cd next && pnpm vitest run src/components/site-config-dialog && pnpm tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Format + commit**

```bash
cd next && pnpm format
git add src/components/site-config-dialog/field-primitives.tsx src/components/site-config-dialog/field-primitives.test.tsx src/components/site-config-dialog/general-settings.tsx
git commit -m "Config dialog mobile: segmented controls wrap as pills, blackout rows stack"
```

---

### Task 5: Full verification (suites + emulated viewport pass)

**Files:** none (verification only; fix regressions in place if found).

- [ ] **Step 1: Full suites**

```bash
cd next && pnpm vitest run && pnpm tsc --noEmit && pnpm lint && pnpm format:check
```
Expected: green except the known 11 baseline failures (use-dashboard-prefs/summer-plan only).

- [ ] **Step 2: Mobile viewport pass (390x844)**

Start `pnpm dev`, drive with browser emulation (chrome-devtools MCP `emulate viewport 390x844x3,mobile,touch` or equivalent). With the dialog open, verify per the spec's checklist:
1. Dialog is edge-to-edge full-screen; compact one-line header with close button.
2. Footer shows exactly Cancel + Save, always visible; Save stretches; tapping Save works.
3. "Add the curator's picks" / "Start fresh" appear at the end of the scroll body; Start fresh opens the confirm.
4. Cards/List toggle absent; add-campground input full width.
5. Expanded campground card: no horizontal overflow (`document.querySelector('[role="dialog"] .overflow-y-auto').scrollWidth <= clientWidth`); Season Window dates stacked; site selectors stacked; segmented controls wrap with every option visible and tappable; card title truncates.
6. General Settings expanded: blackout row on two lines, all inputs usable.
7. Back-swipe: `history.back()` closes the dialog and stays on /app.

- [ ] **Step 3: Desktop regression pass (1280px)**

Reset emulation, verify the dialog looks exactly like production today: floating card with ink border + forest shadow, big masthead with eyebrow + description, 4-button footer, side-by-side rows, joined segmented bars, single-line blackout rows, Cards/List toggle present.

- [ ] **Step 4: Commit any fixes; report**

If steps 2-3 forced fixes, re-run step 1 and commit with a message describing the fix.
