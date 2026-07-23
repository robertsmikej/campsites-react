# Mobile Configure-Campgrounds Screen: Design

**Date:** 2026-07-23
**Status:** Approved

## Problem

The configure-campgrounds dialog (`next/src/components/site-config-dialog/`) renders its desktop layout unchanged on phones. At 390px the failure is total: the footer forces four `whitespace-nowrap` buttons into one row, pushing Cancel and Save fully off-screen (measured 174px of horizontal overflow), so a phone user cannot save at all. The Season Window date pickers and the notify/adjacency/frequency segmented controls clip off the right edge, two-up field rows never stack, the List view is a 6-column table, and the oversized masthead consumes roughly a quarter of the viewport.

The dialog's state design makes this purely a layout problem: all editable state is lifted into `index.tsx` and children are controlled/presentational, so no data flow changes.

## Decisions (made with Mike)

1. **Full-screen takeover on mobile.** Below the `sm` breakpoint the same dialog goes edge-to-edge (`h-dvh w-screen`, no border, no rounding, no drop shadow); desktop keeps the current floating-card look untouched. One component, one code path, responsive classes over conditional trees wherever possible.
2. **Cards only on mobile.** The Cards/List `Tabs` toggle is hidden below `sm` (the table stays desktop-only); the add-campground input row takes the full width.
3. **Sticky action bar.** On mobile the footer holds just Cancel and a prominent Save, always visible. "Add the curator's picks" and "Start fresh" move to quiet text buttons at the end of the scroll body, rendered on mobile only; the desktop footer keeps all four actions exactly as today.

## Design

### Surface + back behavior

- `DialogContent` classes become mobile-first: full-screen below `sm` (`h-dvh max-h-dvh w-screen max-w-none rounded-none border-0`), current `max-h-[90vh] w-[95vw] sm:max-w-6xl` card restored at `sm+`. The inline hard drop-shadow and 1.5px border apply only at `sm+`.
- Back-swipe support, mirroring `mobile-timeline.tsx`'s established pattern: when the dialog opens on mobile, push a history entry (`window.history.pushState({ cwConfigDialog: true }, "")`); a `popstate` listener closes the dialog. Closing via buttons pops the entry when it owns the top of the stack (same `goBackOr` idiom).

### Header (mobile)

One compact line: title "Configure campgrounds" at roughly 20px plus the close button. The eyebrow ("§ Watchlist · Field station setup") and the descriptive sub-line are hidden below `sm`. Desktop masthead unchanged.

### Footer (mobile)

Sticky bottom bar with Cancel and Save only; Save keeps its disabled logic (`isSaveDisabled`). Curator's picks + Start fresh render after the campground list inside the scroll body, visible below `sm` only (the Start fresh confirm `AlertDialog` moves with the button). Desktop footer identical to today.

### Body stacking pass (mobile, all `sm:`-gated)

- Paddings: body/masthead/footer horizontal padding drops from 30px to 16px below `sm` (replace fixed inline `style` paddings with responsive classes).
- Add-campground: already stacks internally; with the view toggle hidden it owns the row.
- Campground card trigger row: keep grip, name, enable switch, trash, chevron; the name truncates to one line (`line-clamp-1`/`truncate`); `TierChip`s hidden below `sm`.
- Basic info: the `w-32` image thumb is hidden below `sm`; the fields column takes full width (the Facility ID / Type grid already stacks).
- Season Window: `flex-col sm:flex-row` for the two `DatePickerField`s.
- Sites that matter: `flex-col sm:flex-row` for the two `MultiSelectSites`; the popover width caps at `min(16rem, calc(100vw - 2rem))`.
- Segmented controls (`SegmentedControl` in `field-primitives.tsx`): the container wraps (`flex-wrap`) below `sm` so options flow onto multiple lines as whole pills; desktop stays a single inline row. No option text changes.
- Blackout rows (General Settings): two lines on mobile (line 1: from → to date inputs; line 2: label input + delete button); one row on desktop as today.
- Start-day checkbox groups already wrap; sliders and switches are fine as-is.

### Out of scope

- No redesign of the desktop layout, the table view, drag-and-drop mechanics, or any data/save logic.
- The map modal (`campground-map-modal.tsx`) shares the cramped-dialog recipe but is a separate cleanup if wanted later.
- The dashboard greeting's long-email overflow on mobile (noticed during recon) is unrelated; note only.

## Testing

- Component tests: view toggle hidden at mobile (and visible at desktop), mobile footer renders exactly Cancel + Save, curator/start-fresh buttons render in-body on mobile, history-back closes the dialog (popstate handler unit test).
- Live verification at a 390x844 emulated viewport over every section (header, general settings expanded, add row, an expanded campground card, footer): no horizontal overflow (`scrollWidth <= clientWidth` on the dialog body), Save visible without scrolling, all controls tappable. Desktop (1280px+) visually unchanged.
