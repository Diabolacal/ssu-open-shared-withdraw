import { defineConfig } from "vitest/config";

// Unit tests only (no DOM): item keys, transaction building, wallet outcomes.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      // A syntactically valid call target so transactions build in tests.
      VITE_CLAIM_PACKAGE_ID: "0x1234",
    },
  },
});
