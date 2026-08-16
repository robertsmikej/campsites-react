/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { Window } from "happy-dom";

// Node >= 26 defines a `localStorage` global that evaluates to undefined unless
// the process was started with --localstorage-file, and happy-dom leaves any
// global that already exists alone. So localStorage lands as undefined on Node
// 26 while CI (Node 22, where the global doesn't exist at all) gets happy-dom's
// own, so every test touching it throws locally and passes in CI. sessionStorage
// has no such stub and comes through untouched. Storage refuses direct
// construction, so borrow an instance from a throwaway Window.
if (typeof localStorage === "undefined") {
    Object.defineProperty(globalThis, "localStorage", {
        value: new Window().localStorage,
        configurable: true,
        writable: true,
    });
}

afterEach(() => {
    cleanup();
});
