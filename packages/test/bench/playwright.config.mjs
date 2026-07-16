// Playwright as a PURE test runner — no browser, no projects, just test()/expect()
// over our generated logic workload. testDir points at the workload; reporter is
// the terse "line" reporter so output doesn't dominate.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "workloads/playwright",
  testMatch: "**/*.spec.mjs",
  reporter: "line",
  fullyParallel: true,
  forbidOnly: true,
  // no `projects` → no browser launch; these are plain logic tests.
});
