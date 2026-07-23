import { CW } from "@/components/field-notes/cw-tokens";

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label
            className="mb-2 block whitespace-nowrap font-mono-field font-medium uppercase"
            style={{ fontSize: 10, letterSpacing: "0.16em", color: CW.clay }}
        >
            {children}
            {required && <span style={{ color: CW.clay, marginLeft: 3 }}>*</span>}
        </label>
    );
}

export function Hint({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-[7px] font-italic-serif italic" style={{ fontSize: 14, color: CW.inkSoft }}>
            {children}
        </div>
    );
}

export function SectionDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3" style={{ margin: "24px 0 12px" }}>
            <span
                className="whitespace-nowrap font-mono-field font-medium uppercase"
                style={{ fontSize: 10, letterSpacing: "0.16em", color: CW.clay }}
            >
                § {label}
            </span>
            <span className="h-px flex-1" style={{ background: CW.rule }} />
        </div>
    );
}

export function TierChip({ tier, count }: { tier: "fav" | "worth"; count: number }) {
    const isFav = tier === "fav";
    return (
        <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full font-mono-field font-bold"
            style={{
                fontSize: 10,
                letterSpacing: "0.04em",
                padding: "5px 8px",
                color: isFav ? CW.clay : CW.forest,
                background: isFav
                    ? "color-mix(in srgb, var(--cw-clay) 14%, transparent)"
                    : "color-mix(in srgb, var(--cw-forest) 12%, transparent)",
            }}
        >
            {isFav ? "★" : "◇"} {count}
        </span>
    );
}

interface SegmentedControlProps<T extends string> {
    options: Array<{ value: T; label: string; disabled?: boolean }>;
    value: T | undefined;
    onChange: (value: T) => void;
}

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
