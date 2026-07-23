import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SiteConfigDialog } from "./index";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

const baseProps = {
    onSave: vi.fn(),
    onAddDefaults: vi.fn(),
    onStartFresh: vi.fn(),
    initialData: { "recreation.gov": [] } as SiteConfig,
    globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] } as GlobalSettings,
    availableSites: {},
    useMockData: false,
    onToggleMockData: vi.fn(),
    focusedCampgroundId: null,
};

function mockMatchMedia(matches: boolean) {
    vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
            matches,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            onchange: null,
            dispatchEvent: vi.fn(),
        })),
    );
}

describe("SiteConfigDialog mobile history integration", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("pushes a history entry when opened on a narrow viewport", () => {
        mockMatchMedia(true);
        const pushSpy = vi.spyOn(window.history, "pushState");
        render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        expect(pushSpy).toHaveBeenCalledWith({ cwConfigDialog: true }, "");
    });

    it("does not touch history on a desktop viewport", () => {
        mockMatchMedia(false);
        const pushSpy = vi.spyOn(window.history, "pushState");
        render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        expect(pushSpy).not.toHaveBeenCalled();
    });

    it("closes via onClose when the user swipes back (popstate)", () => {
        mockMatchMedia(true);
        const onClose = vi.fn();
        render(<SiteConfigDialog {...baseProps} open onClose={onClose} />);
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
        expect(onClose).toHaveBeenCalled();
    });

    it("pops its own history entry when closed by button (unmount/open=false)", () => {
        mockMatchMedia(true);
        const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
        vi.spyOn(window.history, "pushState").mockImplementation(function (this: History, state: unknown) {
            // happy-dom pushState may not update history.state; emulate it.
            Object.defineProperty(window.history, "state", { value: state, configurable: true });
        });
        const { rerender } = render(<SiteConfigDialog {...baseProps} open onClose={vi.fn()} />);
        rerender(<SiteConfigDialog {...baseProps} open={false} onClose={vi.fn()} />);
        expect(backSpy).toHaveBeenCalled();
    });

    it("does not push a duplicate history entry when onClose identity changes while still open", () => {
        mockMatchMedia(true);
        const pushSpy = vi.spyOn(window.history, "pushState");
        const onCloseA = vi.fn();
        const { rerender } = render(<SiteConfigDialog {...baseProps} open onClose={onCloseA} />);
        const onCloseB = vi.fn();
        rerender(<SiteConfigDialog {...baseProps} open onClose={onCloseB} />);
        expect(pushSpy).toHaveBeenCalledTimes(1);
    });
});
