"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    // Render a placeholder of the same size during SSR / pre-hydration so
    // the layout doesn't jump and so the icon doesn't flash the wrong glyph.
    if (!mounted) {
        return (
            <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled>
                <Sun className="size-4" />
            </Button>
        );
    }

    const isDark = (theme === "dark") || (theme === "system" && resolvedTheme === "dark");
    const nextTheme = isDark ? "light" : "dark";

    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(nextTheme)}
        >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
    );
}
