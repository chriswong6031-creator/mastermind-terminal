import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Only include files using the vitest describe/it API.
    // The .mjs files in components/__tests__/ and tests/ use a custom console runner
    // and are not vitest suites — exclude them to avoid "no test suite found" failures.
    include: ["lib/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
