# Configure Campgrounds Modal — Field Notes Reskin Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reskin the existing `SiteConfigDialog` to the "Field Notes" editorial theme from the design handoff — paper modal with forest offset-shadow, editorial masthead, postcard accordion cards with tier chips, mono clay field labels, cream inputs with forest focus rings, §-section dividers, clay/forest site chip-pills, a segmented notify control, gold-ringed weekend day checkboxes — **while preserving all current functionality** (drag reorder, cards/list view toggle, image preview, per-campground date pickers, stay-length slider, general settings, add-campground).

**Architecture:** Pure restyle + light restructure of existing components. No new state or data flow. Logic, props, and persistence are unchanged; this swaps shadcn-generic styling for the existing `cw-*` tokens + `font-poster/italic-serif/body-serif/mono-field` (all already loaded) to match the mock.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (`cw-*` tokens), shadcn/ui Dialog/Accordion/Tabs already in use, dnd-kit (existing reorder), Vitest.

**Design source of truth (pixel spec):** `/tmp/cw_design/camp/project/design_handoff_availability_and_modal/Configure Campgrounds Modal.html` — every class (`.modal`, `.mhead`, `.cg`, `.cg-head`, `.tchip`, `.field`, `.lab`, `.inp`, `.ms`, `.pill`, `.tog`, `.seg`, `.day`, `.seclabel`, `.btn`) has final measurements/colors. The handoff `README.md` §FEATURE 2 lists the field order.

**Token note:** the app's `--cw-clay` (#9c4a31) and `--cw-mustard` (#8e7416) are intentionally darker than the mock (#B65C3F/#C9A227) for text contrast. Use the app tokens for text/labels; for the gold weekend ring (decorative, not text) use the brighter mustard `rgba(201,162,39,0.5)` literal to match the mock.

---

## Existing components (read before editing)

- `src/components/site-config-dialog/index.tsx` — `SiteConfigDialog`: `Dialog`/`DialogContent` shell, `DialogHeader`+`DialogTitle "Configure Campgrounds"`, scrolling body (`GeneralSettings`, `AddCampground`, cards/list `Tabs`, `Accordion` of `SortableCampgroundEditor`, or `CampgroundsTable`), `DialogFooter` (Reset/Cancel/Save). All state/handlers stay.
- `src/components/site-config-dialog/campground-editor.tsx` — `CampgroundEditor` (the `AccordionItem` per campground): header (grip, name, enable switch, delete, chevron) + `AccordionContent` fields: name/area/id/source/type/description, two `DatePickerField`s, `MultiSelectSites` (favorites/worthwhile) or textarea fallback, show/hide `Switch`es, notify-scope segmented buttons, start-days `Checkbox`es, stay-length `Slider`. `MultiSelectSites` is already `modal` (scroll fix).
- `src/components/ui/dialog.tsx`, `accordion.tsx`, `button.tsx`, `badge.tsx`, `checkbox.tsx`, `slider.tsx` — shadcn primitives. Restyle via `className` on the dialog usage; only touch the primitives if a token can't be applied from the call site.

**Do not change:** `serialize.ts`, `drag-drop.ts`, `types.ts`, `general-settings.tsx`, `add-campground.tsx`, `campgrounds-table.tsx` logic. Restyle their markup only where they render inside the modal.

---

## File structure

- Modify `src/components/site-config-dialog/index.tsx` — modal shell, masthead header, footer, body padding/background.
- Modify `src/components/site-config-dialog/campground-editor.tsx` — card chrome (tier chips, grip, chevron, expanded shadow), field primitives, section dividers, chip-pill multiselect styling, segmented notify control, gold-ring day checkboxes, stay-length presentation.
- Create `src/components/site-config-dialog/field-primitives.tsx` — small shared presentational helpers used by the editor: `<FieldLabel>`, `<SectionDivider section="I — Season Window">`, `<Hint>`, `<TierChip tier count>`, `<SegmentedControl>`. Keeps the editor readable and DRY.
- Create `src/components/site-config-dialog/field-primitives.test.tsx` — render tests for `SegmentedControl` (active state, onChange) and `TierChip` (label).
- (Optional) extend `src/components/site-config-dialog/*.test.*` if present, else add a smoke test that the dialog renders with the new structure.

---

## Task 1: Field primitives (TDD where logic exists)

**Files:**
- Create: `src/components/site-config-dialog/field-primitives.tsx`
- Test: `src/components/site-config-dialog/field-primitives.test.tsx`

Components & specs (from the mock CSS):
- `FieldLabel({children, required})` → `<label>` `font-mono-field 10px uppercase letter-spacing:.16em text-cw-clay mb-2`, optional `*` (clay) when `required`.
- `Hint({children})` → `font-italic-serif italic 14px text-cw-ink-soft mt-[7px]`.
- `SectionDivider({label})` → flex row: `<span>` `font-mono-field 10px uppercase letter-spacing:.16em text-cw-clay` rendering `§ {label}` + a `flex-1 h-px bg-cw-rule`. Margin `24px 0 12px`.
- `TierChip({tier:"fav"|"worth", count})` → pill `font-mono-field 10px font-bold px-2 py-[5px] rounded-full`; fav → `text-cw-clay bg-[color-mix(in_srgb,var(--cw-clay)_14%,transparent)]` with `★ {count}`; worth → `text-cw-forest bg-[color-mix(...forest 12%...)]` with `◇ {count}`.
- `SegmentedControl({options:{value,label}[], value, onChange})` → `inline-flex border-[1.5px] border-cw-ink rounded-[3px] overflow-hidden`; each button `font-mono-field 11px uppercase letter-spacing:.1em px-[15px] py-[11px] border-r-[1.5px] border-cw-ink last:border-r-0`; active → `bg-cw-forest text-cw-cream`; inactive → `bg-cw-cream text-cw-ink-soft hover:bg-cw-paper hover:text-cw-ink`.

- [ ] Step 1: Write `field-primitives.test.tsx`: `SegmentedControl` renders all options, marks `value` active, fires `onChange` with the clicked value; `TierChip fav count={2}` shows "★ 2".
- [ ] Step 2: Run `npx vitest run src/components/site-config-dialog/field-primitives.test.tsx` — FAIL.
- [ ] Step 3: Implement `field-primitives.tsx`.
- [ ] Step 4: Run tests — PASS.
- [ ] Step 5: Commit (`feat(config-modal): field-notes form primitives`).

---

## Task 2: Modal shell + masthead + footer

**Files:**
- Modify: `src/components/site-config-dialog/index.tsx`

- [ ] Step 1: **Shell.** On `<DialogContent>` apply the paper modal look: keep existing `flex max-h-[90vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden sm:max-w-6xl` and add `bg-cw-paper border-[1.5px] border-cw-ink p-0` and inline `style={{ boxShadow: "10px 12px 0 var(--cw-forest), 0 40px 90px -30px rgba(20,15,12,0.8)" }}`. (Drop the default rounded/ring shadcn look; the mock is square-ish — `rounded-none` or keep a tiny radius.) Note: `DialogContent` adds a default close button; hide it (`showCloseButton={false}`) and use the custom masthead close.
- [ ] Step 2: **Masthead.** Replace `DialogHeader`/`DialogTitle` with the editorial header: container `bg-cw-cream border-b-2 border-cw-ink px-[30px] pt-6 pb-5 flex items-start justify-between`. Left: kicker `font-mono-field 10px uppercase letter-spacing:.22em text-cw-clay` = `§ Watchlist · Field Station Setup`; `<DialogTitle>` styled `font-poster font-black text-[38px] leading-[0.92] uppercase` = `CONFIGURE` with a block `<em>` `font-italic-serif italic 30px text-cw-forest normal-case` = `campgrounds`; subtitle `font-italic-serif italic 16px text-cw-ink-soft mt-[7px]` = e.g. `{n} places on watch · drag to reorder, tag the sites that matter.`. Right: square close button `w-[38px] h-[38px] border-[1.5px] border-cw-ink rounded-[2px] bg-cw-paper hover:bg-cw-ink [&:hover_svg]:stroke-cw-cream` wired to `onClose`. Keep `DialogTitle` for a11y (visually styled, not removed).
- [ ] Step 3: **Body.** Wrap the scrolling region: `bg-cw-paper px-[30px] pt-6 pb-[30px] overflow-auto flex-1`. Keep `GeneralSettings`, `AddCampground`, the cards/list `Tabs`, expand/collapse controls, and the `Accordion`/`CampgroundsTable` — just inheriting the paper bg. Restyle the cards/list `Tabs` minimally to fit (mono labels) but keep functionality.
- [ ] Step 4: **Footer.** Restyle `DialogFooter`: `bg-cw-cream border-t-2 border-cw-ink px-[30px] py-[18px] flex items-center justify-between`. Left: `Reset to defaults` as `.btn.danger` (transparent, `text-cw-clay`, `hover:border-cw-clay hover:bg-[color-mix(clay 8%)]`). Right group: `Cancel` ghost (`bg-cw-paper border-[1.5px] border-cw-ink hover:bg-cw-ink hover:text-cw-cream`) + `Save` solid (`bg-cw-forest text-cw-cream border-[1.5px] border-cw-forest` with pressable `style={{boxShadow:"3px 3px 0 var(--cw-forest-deep)"}}`, hover translate). All button labels `font-poster font-extrabold 12px uppercase letter-spacing:.12em`. Add `--cw-forest-deep:#142a1d` token if not present (globals.css `:root` + `.dark` lighter; mirror Timeline plan Task 8 if doing both).
- [ ] Step 5: `npx tsc --noEmit`; open the dialog in the app and confirm it renders (manual). Commit (`feat(config-modal): paper shell, masthead, footer`).

---

## Task 3: Accordion card chrome + tier chips

**Files:**
- Modify: `src/components/site-config-dialog/campground-editor.tsx`

The editor renders an `AccordionItem`. Restyle to the postcard `.cg`:

- [ ] Step 1: **Card.** `AccordionItem` → `bg-cw-cream border-[1.5px] border-cw-ink mb-4`; collapsed `style={{boxShadow:"4px 4px 0 rgba(26,22,20,0.14)"}}`, expanded `style={{boxShadow:"5px 5px 0 var(--cw-forest)"}}` (toggle via the `expanded` prop). Remove the rounded shadcn border.
- [ ] Step 2: **Header row** (`AccordionTrigger`/header): keep the drag grip (style as the 2×3 dot grid: `grid grid-cols-2 gap-[3px] opacity-40 cursor-grab`, dots `w-[3px] h-[3px] rounded-full bg-cw-ink`), name `font-italic-serif italic 23px` (muted `text-cw-ink-soft` when collapsed), the existing enable `Switch`, the delete button (icon, `hover:border-cw-clay [&:hover_svg]:stroke-cw-clay`), and a chevron `border-r-2 border-b-2 border-cw-ink-soft rotate-45` → `-rotate-135` when expanded. Keep current click-to-expand + stopPropagation on controls.
- [ ] Step 3: **Tier chips.** Between name and controls, render `<TierChip tier="fav" count={favoritesArray.length}/>` (when >0) and `<TierChip tier="worth" count={worthwhileArray.length}/>` (when >0) using the live counts from the editable campground.
- [ ] Step 4: **Body.** `AccordionContent` → `border-t border-dashed border-cw-rule px-5 pt-[22px] pb-6`.
- [ ] Step 5: `npx tsc --noEmit`; manual check. Commit (`feat(config-modal): postcard cards + tier chips`).

---

## Task 4: Field primitives applied — inputs, dates, sections

**Files:**
- Modify: `src/components/site-config-dialog/campground-editor.tsx`

- [ ] Step 1: Replace each field's `Label`/`Input`/hint with `FieldLabel`/styled input/`Hint`. Inputs (`.inp`): `w-full bg-cw-cream border-[1.5px] border-cw-rule rounded-[3px] px-[13px] py-3 font-body-serif text-base text-cw-ink focus:border-cw-forest focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--cw-forest)_12%,transparent)] outline-none`; placeholder `italic text-cw-ink-faint`. Facility ID + Source use `font-mono-field text-sm`. Textarea `min-h-[78px] resize-y leading-relaxed`.
- [ ] Step 2: Layout: keep field order from the mock — Name*, Area/Region, grid2(Facility ID* | Type), Source, Description, then `<SectionDivider label="I — Season Window"/>`, grid2(Start | End dates), `<SectionDivider label="II — Sites that matter"/>`, grid2(favorites | worthwhile selectors), toggles, `<SectionDivider label="III — When to write you"/>`, Email-me-when, Start Days, Stay Length. `grid2` = `grid grid-cols-1 sm:grid-cols-2 gap-[22px]` (collapses on narrow per handoff responsive note).
- [ ] Step 3: **Date fields** (`DatePickerField`): wrap input with a left clay calendar icon (`absolute left-[13px]`, stroke `var(--cw-clay)`), mono value (`pl-10 font-mono-field text-sm`), and a right clear `×` button (`absolute right-[11px] hover:bg-cw-rule-soft hover:text-cw-clay rounded-full`). Keep the existing popover calendar behavior.
- [ ] Step 4: `npx tsc --noEmit`; manual check. Commit (`feat(config-modal): themed inputs, dates, section dividers`).

---

## Task 5: Site chip-pill multiselect

**Files:**
- Modify: `src/components/site-config-dialog/campground-editor.tsx`

`MultiSelectSites` currently renders selected sites as shadcn `Badge`s inside a button trigger + a `Popover`+`Command` picker (already `modal`). Restyle the **selected display** to the mock's chip-pill box, keep the picker.

- [ ] Step 1: Trigger box (`.ms`): `bg-cw-cream border-[1.5px] border-cw-rule rounded-[3px] p-[8px_9px] min-h-12 flex flex-wrap gap-[7px] items-center cursor-text focus-within:border-cw-forest focus-within:shadow-[0_0_0_3px_...forest]`. For the **favorites** box add the clay focus variant (`fav` → `focus-within:border-cw-clay` + clay ring). Pass a `variant="fav"|"worth"` prop.
- [ ] Step 2: Selected pills (`.pill`): `inline-flex items-center gap-[6px] px-[9px] py-[6px] rounded-full font-mono-field 13px font-semibold`; fav → `bg-cw-clay text-cw-cream` with a `★` mark; worth → `bg-cw-forest text-cw-cream` with `◇`; removable `×` (`opacity-70 hover:opacity-100`) calls the existing remove handler. Placeholder when empty: `font-italic-serif italic 15px text-cw-ink-faint` "Type to add a site…".
- [ ] Step 3: Keep the existing `Popover`+`Command` add/search picker (the roster autocomplete + custom-add) unchanged behaviorally; restyle its items lightly to match (mono). Keep the textarea fallback for when no roster is loaded, themed as a normal `.inp`.
- [ ] Step 4: `FieldLabel` for the two selectors: favorites label `★` clay, worthwhile label `◇` forest. `Hint`s: "The ones you'd drive back for…" / "Good enough if a favorite won't free up."
- [ ] Step 5: `npx tsc --noEmit`; manual check that add/remove/scroll all still work. Commit (`feat(config-modal): clay/forest site chip pills`).

---

## Task 6: Toggles, segmented notify control, gold-ring day checkboxes, stay length

**Files:**
- Modify: `src/components/site-config-dialog/campground-editor.tsx`

- [ ] Step 1: **Show/hide toggles** (`.tog`): the three `Switch`es (Favorites/Worthwhile/All others) as a `flex gap-[26px]` row; label `font-body-serif 16px`, with a clay `★`/forest `◇` glyph prefix on the first two. Track off `bg-cw-ink-faint`, on `bg-cw-forest` (shadcn Switch already supports checked color — set via class). Keep current handlers.
- [ ] Step 2: **Email me when** → replace the existing notify-scope button group with `<SegmentedControl options={[{value:"favorites",label:"Favorites only"},{value:"worthwhile",label:"Favorites + Worthwhile"},{value:"all",label:"Any site opens"}]} value={notifyScope ?? (notifyAll?"all":undefined)} onChange={...}/>`. Keep the existing `onFieldChange("notifyScope", …)` + clear-legacy-`notifyAll` logic and the "Use account default" ghost (style `.ghost`: `font-mono-field 11px uppercase border border-cw-rule rounded-full px-3 py-[6px] text-cw-forest hover:border-cw-forest hover:bg-[color-mix(forest 6%)]`). Hint: "Favorites means only the sites you've starred above."
- [ ] Step 3: **Start Days** checkboxes (`.day`): row of 7 boxes Sun–Sat; box `w-5 h-5 border-[1.5px] border-cw-rule rounded-[4px] bg-cw-cream`, checked → `bg-cw-forest border-cw-forest` with a cream check SVG. **Fri & Sat boxes get a gold ring** `style={{boxShadow:"0 0 0 2px rgba(201,162,39,0.5)"}}` (the `.prime` class). Keep the existing per-campground vs global logic. Add the two ghost shortcuts to the inline header: **"Use global"** (selects all / clears the per-campground override per current behavior) and **"Prime days only"** (sets exactly `["Friday","Saturday"]`). Hint: "Gold-ringed days are weekend (Fri/Sat) nights — your prime-time getaways."
- [ ] Step 4: **Stay Length** — keep the existing slider + per-campground/global logic, but present it under the mock's inline header pattern: label `Stay Length` + a `.ghost` "Customize" (toggles the slider/override on, matching current `Customize`/`Use global` buttons) and a `Hint` "Currently {min}–{max} nights · matching your account default." Keep the slider visible when customized.
- [ ] Step 5: `npx tsc --noEmit`; manual check all controls persist on Save. Commit (`feat(config-modal): segmented notify, gold weekend days, stay length`).

---

## Task 7: Verify + ship

- [ ] Step 1: `npx tsc --noEmit` (clean).
- [ ] Step 2: `npx vitest run` (all pass; fix any snapshot/structure tests touching the dialog).
- [ ] Step 3: `npm run lint` (0 warnings) + `npm run format`.
- [ ] Step 4: `npm run build` (succeeds).
- [ ] Step 5: Manual: open Configure dialog → expand a card → edit each field, add/remove site chips, toggle segmented control + weekend days + Prime/Use-global, pick dates, drag-reorder, switch cards/list view, Save → confirm everything persists (no regression vs. before). Check dark mode + narrow width (grids collapse, modal scrolls).
- [ ] Step 6: Commit outstanding; hand back for push/deploy.

---

## Self-review notes (author)

- Spec coverage: shell/masthead/footer ✓ (T2), postcard cards + tier chips ✓ (T3), themed inputs/dates/§-dividers ✓ (T4), clay/forest chip pills ✓ (T5), toggles + segmented + gold weekend days + stay length ✓ (T6). Field order matches the mock.
- Functionality preserved: drag reorder, cards/list toggle, image preview (kept as-is in the editor, inherits theme), general settings, add-campground, stay slider, per-campground date/day/stay overrides, notify-scope legacy fallback — all untouched logically.
- Shares the per-site ★/◇ tier language with the Timeline (same `sites.favorites`/`worthwhile` source) so the two features stay consistent.
- `--cw-forest-deep` token needed for the Save button shadow (add once; shared with Timeline plan if both run).
