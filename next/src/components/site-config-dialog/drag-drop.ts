import type { DragEndEvent } from "@dnd-kit/core";

export function createDragEndHandler<T extends { id?: string }>(
    items: T[],
    setItems: (next: T[]) => void,
) {
    return (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const ids = items.map((c, idx) => c.id || `idx-${idx}`);
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setItems(next);
    };
}
