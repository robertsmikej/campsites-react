"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function useColorMode() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const mode: "light" | "dark" = mounted ? ((resolvedTheme as "light" | "dark") ?? "light") : "light";

    return {
        mode,
        setMode: (next: "light" | "dark") => setTheme(next),
        rawTheme: theme,
    };
}
