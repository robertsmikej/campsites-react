// Build a display-friendly facility name by appending the facility type when
// the name doesn't already contain it. "Shoreline" + "campground" → "Shoreline
// Campground"; "Redfish Cabin" + "cabin" → "Redfish Cabin" (no-op).

const TYPE_LABELS: Record<string, string> = {
    campground: "Campground",
    cabin: "Cabin",
    lookout: "Lookout",
};

export function displayName(name: string, type?: string): string {
    if (!type) return name;
    const label = TYPE_LABELS[type];
    if (!label) return name;

    // Already contains the type word (case-insensitive) — leave it alone.
    if (name.toLowerCase().includes(label.toLowerCase())) return name;

    return `${name} ${label}`;
}
