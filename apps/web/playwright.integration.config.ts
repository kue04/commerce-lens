import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Requires the separately started deterministic Fastify + PostgreSQL backend.
export default defineConfig({
  ...base,
  testDir: "./tests/real-integration",
  testIgnore: [],
  outputDir: "./artifacts/http-only/playwright",
  workers: 1,
  fullyParallel: false,
  use: { ...base.use, trace: "on" },
});
