import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    test: {
        environment: "happy-dom",
        globals: true,
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        setupFiles: ["src/__tests__/setup.ts"],
    },
});
