import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const localChrome =
  "C:/Users/kk/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/real-integration/**", "**/real-agent/**"],
  fullyParallel: true,
  workers: 2,
  timeout: 25_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync(localChrome) ? localChrome : undefined),
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  reporter: [["list"]],
});
