import { C } from "@/components/field-notes/tokens";

// Hover/focus styles shared by both lookup variants — injected once, no @import.
export function LookupStyles() {
    return (
        <style>{`
            .cw-chip:hover { background: ${C.ink} !important; color: ${C.cream} !important; border-color: ${C.ink} !important; }
            .cw-input:focus { outline: none; border-color: ${C.forest}; box-shadow: 0 0 0 3px rgba(31,61,42,0.12); }
        `}</style>
    );
}
