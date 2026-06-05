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
    options: Array<{ value: T; label: string }>;
    value: T | undefined;
    onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
    return (
        <div
            className="inline-flex overflow-hidden rounded-[3px]"
            style={{ border: `1.5px solid ${CW.ink}` }}
        >
            {options.map((opt, i) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(opt.value)}
                        className="cursor-pointer whitespace-nowrap font-mono-field font-bold uppercase transition-colors"
                        style={{
                            fontSize: 11,
                            letterSpacing: "0.1em",
                            padding: "11px 15px",
                            borderRight: i < options.length - 1 ? `1.5px solid ${CW.ink}` : undefined,
                            background: active ? CW.forest : CW.cream,
                            color: active ? CW.cream : CW.inkSoft,
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
