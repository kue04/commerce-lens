import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (process.env.COMMERCE_LENS_REAL_AGENT_ONCE !== "1") {
  throw new Error("Set COMMERCE_LENS_REAL_AGENT_ONCE=1 only for an explicitly authorized real model run.");
}

export default defineConfig({
  ...base,
  testDir: "./tests/real-agent",
  testIgnore: [],
  outputDir: "./artifacts/real-agent-20261023/playwright",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: { ...base.use, trace: "on", screenshot: "on" },
});
