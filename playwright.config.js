// @ts-nocheck
const { defineConfig, devices } = require("@playwright/test");

// The suite runs the real frontend against the real backend and a real MySQL schema. Nothing is
// mocked: every assertion below is the actual application talking to ECOMMERCE_TEST_DB.
//
// Two hard constraints shape this file:
//  1. Specs live in ./e2e, never under src/. CRA sets jest `roots` to <rootDir>/src, so a spec
//     inside src/ would be collected by `react-scripts test` and fail on the Playwright imports.
//  2. workers: 1. AuthRateLimitFilter caps auth attempts per IP per minute and every worker is
//     127.0.0.1, so parallel workers would rate-limit each other into flakiness rather than
//     finding real bugs.
//
// There is deliberately no root tsconfig.json anywhere in this project: react-scripts switches to
// TypeScript mode on its mere existence and `npm start` then breaks.
module.exports = defineConfig({
  testDir: "./e2e",
  // Sequential and single-worker: see the rate-limit note above.
  workers: 1,
  fullyParallel: false,
  // No retries. A retry would hide exactly the flakiness worth knowing about, and the brief is
  // explicit that assertions must not be weakened.
  retries: 0,
  // Generous enough to absorb one AuthRateLimitFilter window (60s) when the suite trips it.
  timeout: 150_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "e2e-results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3001",
    // Installed Chrome rather than bundled Chromium: `playwright install` needs a download this
    // environment cannot be assumed to have.
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
