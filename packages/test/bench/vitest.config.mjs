// Minimal vitest config: only our generated workload, threads pool, no watch,
// no coverage, quiet reporter. Kept lean so we measure vitest's runner overhead.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["workloads/vitest/**/*.test.mjs"],
    watch: false,
    pool: "threads",
    reporters: ["dot"],
    passWithNoTests: false,
  },
});
