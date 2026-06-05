// CampWatch Field Notes tokens — CSS variable references for runtime dark-mode swap.
// Use these in /app and /discover where the user can toggle theme. Use the literal
// palette (tokens.ts → C) on the marketing homepage where dark mode is unnecessary.
export const CW = {
    paper: "var(--cw-paper)",
    cream: "var(--cw-cream)",
    ink: "var(--cw-ink)",
    inkSoft: "var(--cw-ink-soft)",
    inkSubtle: "var(--cw-ink-subtle)",
    inkFaint: "var(--cw-ink-faint)",
    rule: "var(--cw-rule)",
    ruleSoft: "var(--cw-rule-soft)",
    forest: "var(--cw-forest)",
    forestBright: "var(--cw-forest-bright)",
    forestDeep: "var(--cw-forest-deep)",
    clay: "var(--cw-clay)",
    mustard: "var(--cw-mustard)",
} as const;
