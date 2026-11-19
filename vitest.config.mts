import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["api/**/*.ts"],
      // Type-only module: no runtime code to cover.
      exclude: ["api/lib/types.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
    },
  },
});
