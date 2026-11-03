import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // Explicit return types on exported functions (CLAUDE.md). Not for tests, and not for
    // React files: Next.js types pages, and components already say `ReactNode`.
    files: ["**/*.ts", "**/*.mts"],
    ignores: ["**/*.test.ts", "**/*.int.test.ts", "e2e/**"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "tools/**",
  ]),
]);

export default eslintConfig;
