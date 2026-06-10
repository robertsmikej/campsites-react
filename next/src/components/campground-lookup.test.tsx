import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/hooks/use-auth", () => ({
    useAuth: vi.fn(() => ({
        isLoading: false,
        user: { email: "mike@example.com", name: "Mike" },
    })),
}));

vi.mock("@/hooks/use-user-campgrounds", () => ({
    useUserCampgrounds: vi.fn(() => ({
        isHydrating: false,
        siteConfig: { "recreation.gov": [] },
        globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
        missingFromDefault: [],
        save: vi.fn(async () => {}),
    })),
}));

vi.mock("@/hooks/use-is-mobile", () => ({
    useIsMobile: vi.fn(() => false),
}));

import { CampgroundLookup } from "./campground-lookup";
import { defaultDates } from "@/lib/default-dates";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes("/details")) {
            return new Response(JSON.stringify({ name: "Bench Lakes", previewImageUrl: null }), {
                status: 200,
            });
        }
        return new Response("[]", { status: 200 });
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("CampgroundLookup variants", () => {
    it("homepage variant renders the marketing headline and demo chips", () => {
        render(<CampgroundLookup />);
        expect(screen.getByText("CHECK A SPOT")).toBeTruthy();
        expect(screen.getByText("Try →")).toBeTruthy();
    });

    it("dashboard variant drops the marketing headline and demo chips", () => {
        render(<CampgroundLookup variant="dashboard" />);
        expect(screen.queryByText("CHECK A SPOT")).toBeNull();
        expect(screen.queryByText("Try →")).toBeNull();
        // The working parts stay: input + Check button.
        expect(screen.getByRole("textbox")).toBeTruthy();
        expect(screen.getByRole("button", { name: /check/i })).toBeTruthy();
    });

    it("dashboard variant shows add-first copy for a new campground", async () => {
        render(<CampgroundLookup variant="dashboard" />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "234567" } });
        fireEvent.click(screen.getByRole("button", { name: /check/i }));

        await waitFor(() => expect(screen.getByText("Bench Lakes")).toBeTruthy());
        expect(screen.getByText(/not watched yet — ready to add/i)).toBeTruthy();
        expect(screen.queryByText(/we don't track it yet/i)).toBeNull();
        expect(screen.getByRole("button", { name: /add to my watchlist/i })).toBeTruthy();
    });

    it("adds with the shared season-capped default window, not a +6-month one", async () => {
        const save = vi.fn(async (_config: unknown, _gs: unknown) => {});
        vi.mocked(useUserCampgrounds).mockReturnValue({
            isHydrating: false,
            siteConfig: { "recreation.gov": [] },
            globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
            missingFromDefault: [],
            save,
        } as never);

        render(<CampgroundLookup variant="dashboard" />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "234567" } });
        fireEvent.click(screen.getByRole("button", { name: /check/i }));
        await waitFor(() => expect(screen.getByText("Bench Lakes")).toBeTruthy());
        fireEvent.click(screen.getByRole("button", { name: /add to my watchlist/i }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        const savedConfig = save.mock.calls[0]?.[0] as {
            "recreation.gov": Array<{ id: string; dates: { startDate: string; endDate: string } }>;
        };
        const added = savedConfig["recreation.gov"].find((c) => c.id === "234567");
        expect(added?.dates).toEqual(defaultDates());
    });

    it("homepage variant keeps the original status copy for a new campground", async () => {
        render(<CampgroundLookup />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "234567" } });
        fireEvent.click(screen.getByRole("button", { name: /check/i }));

        await waitFor(() => expect(screen.getByText("Bench Lakes")).toBeTruthy());
        expect(screen.getByText(/we don't track it yet/i)).toBeTruthy();
    });
});
