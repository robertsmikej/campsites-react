import { C } from "@/components/field-notes/tokens";

// Status icons for the lookup result card: check (on list / watched), warning
// (addable / not tracked), and X (invalid / not found).

export function LCheck({ color = C.forest, size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path
                d="M6.5 11.5 L9.5 14.5 L15.5 7.5"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function LWarn({ color = C.mustard, size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path d="M11 6 L11 12 M11 15.5 L11 16" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

export function LX({ color = "#A8412A", size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path
                d="M7.5 7.5 L14.5 14.5 M14.5 7.5 L7.5 14.5"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
