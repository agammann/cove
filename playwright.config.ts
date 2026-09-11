import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 300000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:4317",
    browserName: "chromium",
    headless: true,
    actionTimeout: 15000,
    trace: "retain-on-failure",
  },
  reporter: "list",
});
