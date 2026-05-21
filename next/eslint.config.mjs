import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
    ]),
    {
        rules: {
            // This rule flags void-async-in-effect and setState-in-effect patterns
            // that are standard React idioms (e.g. useEffect(() => { void load(); }, [dep])).
            // Disabling to avoid ~15 false-positive errors across the codebase.
            "react-hooks/set-state-in-effect": "off",

            // Honour the common convention of prefixing intentionally-unused
            // parameters/destructured vars with an underscore.
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
        },
    },
]);

export default eslintConfig;
