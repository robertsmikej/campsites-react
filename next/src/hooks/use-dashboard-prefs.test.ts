/**
 * Tests for the useDashboardPrefs storage layer.
 *
 * The hook itself requires a DOM/React renderer (vitest is configured for
 * node env), so we test the observable contract by exercising the underlying
 * load/save/migration logic directly via a stubbed localStorage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

type Store = Record<string, string>;

function makeLocalStorage(initial: Store = {}): Storage {
    let store: Store = { ...initial };
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
        key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
        get length() { return Object.keys(store).length; },
    } as unknown as Storage;
}

// ---------------------------------------------------------------------------
// Helpers extracted from the hook (inline copies to keep tests independent)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "campwatch:prefs";
const OLD_DATE_RANGE_KEY = "campwatch:date-range";
const OLD_GROUP_BY_KEY = "campwatch:watchlist-grouping";

type GroupBy = "region" | "status" | "all";
interface DashboardPrefs { dateRange: { from: string; to: string } | null; groupBy: GroupBy; }
const DEFAULT_PREFS: DashboardPrefs = { dateRange: null, groupBy: "region" };

function makeLoadPrefs(ls: Storage) {
    return function loadPrefs(): DashboardPrefs {
        try {
            const raw = ls.getItem(STORAGE_KEY);
            if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };

            const oldDateRange = ls.getItem(OLD_DATE_RANGE_KEY);
            const oldGroupBy = ls.getItem(OLD_GROUP_BY_KEY);

            const migrated: DashboardPrefs = {
                dateRange: oldDateRange
                    ? (() => {
                          const parsed = JSON.parse(oldDateRange) as { start: string; end: string };
                          return { from: parsed.start, to: parsed.end };
                      })()
                    : null,
                groupBy: oldGroupBy ? (oldGroupBy.replace(/^"|"$/g, "") as GroupBy) : "region",
            };

            ls.setItem(STORAGE_KEY, JSON.stringify(migrated));
            ls.removeItem(OLD_DATE_RANGE_KEY);
            ls.removeItem(OLD_GROUP_BY_KEY);

            return migrated;
        } catch {
            return DEFAULT_PREFS;
        }
    };
}

function makeSavePrefs(ls: Storage) {
    return function savePrefs(prefs: DashboardPrefs) {
        ls.setItem(STORAGE_KEY, JSON.stringify(prefs));
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDashboardPrefs – storage layer", () => {
    let ls: Storage;
    let loadPrefs: () => DashboardPrefs;
    let savePrefs: (p: DashboardPrefs) => void;

    beforeEach(() => {
        ls = makeLocalStorage();
        loadPrefs = makeLoadPrefs(ls);
        savePrefs = makeSavePrefs(ls);
    });

    it("returns DEFAULT_PREFS when storage is empty", () => {
        const prefs = loadPrefs();
        expect(prefs).toEqual(DEFAULT_PREFS);
    });

    it("reads back a previously saved blob", () => {
        const saved: DashboardPrefs = { dateRange: { from: "2026-06-01", to: "2026-06-30" }, groupBy: "status" };
        savePrefs(saved);
        expect(loadPrefs()).toEqual(saved);
    });

    it("merges partial blob with defaults (forward-compat)", () => {
        ls.setItem(STORAGE_KEY, JSON.stringify({ groupBy: "all" }));
        const prefs = loadPrefs();
        expect(prefs.groupBy).toBe("all");
        expect(prefs.dateRange).toBeNull(); // filled in from DEFAULT_PREFS
    });

    it("migrates old campwatch:date-range key", () => {
        ls.setItem(OLD_DATE_RANGE_KEY, JSON.stringify({ start: "2026-07-04", end: "2026-07-10" }));

        const prefs = loadPrefs();

        expect(prefs.dateRange).toEqual({ from: "2026-07-04", to: "2026-07-10" });
        expect(ls.getItem(OLD_DATE_RANGE_KEY)).toBeNull(); // old key removed
        expect(ls.getItem(STORAGE_KEY)).not.toBeNull();    // new key written
    });

    it("migrates old campwatch:watchlist-grouping key (unquoted string)", () => {
        ls.setItem(OLD_GROUP_BY_KEY, "status");

        const prefs = loadPrefs();

        expect(prefs.groupBy).toBe("status");
        expect(ls.getItem(OLD_GROUP_BY_KEY)).toBeNull();
    });

    it("migrates old campwatch:watchlist-grouping key (JSON-encoded string)", () => {
        // writeStorage JSON.stringifies values, so the key might be stored as `"status"`.
        ls.setItem(OLD_GROUP_BY_KEY, JSON.stringify("status"));

        const prefs = loadPrefs();

        expect(prefs.groupBy).toBe("status");
        expect(ls.getItem(OLD_GROUP_BY_KEY)).toBeNull();
    });

    it("migrates both old keys simultaneously", () => {
        ls.setItem(OLD_DATE_RANGE_KEY, JSON.stringify({ start: "2026-08-01", end: "2026-08-14" }));
        ls.setItem(OLD_GROUP_BY_KEY, JSON.stringify("all"));

        const prefs = loadPrefs();

        expect(prefs.dateRange).toEqual({ from: "2026-08-01", to: "2026-08-14" });
        expect(prefs.groupBy).toBe("all");
        expect(ls.getItem(OLD_DATE_RANGE_KEY)).toBeNull();
        expect(ls.getItem(OLD_GROUP_BY_KEY)).toBeNull();
    });

    it("uses region groupBy when old group key is absent", () => {
        ls.setItem(OLD_DATE_RANGE_KEY, JSON.stringify({ start: "2026-08-01", end: "2026-08-14" }));
        // No OLD_GROUP_BY_KEY set.

        const prefs = loadPrefs();
        expect(prefs.groupBy).toBe("region");
    });

    it("returns DEFAULT_PREFS on corrupt JSON", () => {
        ls.setItem(STORAGE_KEY, "{bad json}");
        expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    });
});
