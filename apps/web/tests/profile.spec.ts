import { test, expect } from "@playwright/test";
import example from "../../../packages/contracts/examples/dataset-profile.json" with { type: "json" };
import flow from "../../../packages/contracts/examples/payment-flow.json" with { type: "json" };
import { transport } from "./http-support";
import type { DatasetProfile } from "../src/lib/types";

test("概况显示源的真实零与缺失检查，水位和实际日期分别展示", async ({ page }) => {
  const state = await transport(page);
  const data = structuredClone(example) as DatasetProfile;
  data.sources[0]!.status = "partial";
  data.sources[0]!.missingPartitions = ["2026-10-19"];
  data.sources[0]!.lastCompleteDate = "2026-10-18";
  data.sources[3] = { ...data.sources[3]!, status: "missing", rowCount: 0, coverageStart: null, completeThrough: null, lastCompleteDate: null, checkedAt: null, reason: "未发布库存覆盖检查" };
  data.sources[4]!.rowCount = 0;
  await page.route("**/api/datasets/*/profile", (route) => route.fulfill({ json: { ...data, dataset: flow.catalog.datasets.find((item) => item.version === flow.catalog.version)!, publishedAt: flow.catalog.updatedAt } }));
  await page.goto("/?page=profile");
  await expect(page.locator(".source-profiles article")).toHaveCount(6);
  await expect(page.locator('[data-source="orders"]')).toContainText("2026-10-19");
  await expect(page.locator('[data-source="orders"]')).toContainText("2026-10-18");
  await expect(page.locator('[data-source="inventory"]')).toContainText("缺少覆盖检查");
  await expect(page.locator('[data-source="inventory"]')).toContainText("尚未检查");
  await expect(page.locator('[data-source="traffic"]')).toContainText("可用");
  await expect(page.locator('[data-source="traffic"]')).toContainText("实际记录数0");
  await expect(page.locator(".profile-definitions article")).toHaveCount(3);
  await expect(page.locator(".profile-definitions")).toContainText("所需数据源");
  expect(state.starts).toBe(0);
  expect(state.sessions).toBe(0);
});

test("概况请求失败与契约错配不显示旧值，可单独重试", async ({ page }) => {
  await transport(page);
  let mode: "failure" | "invalid" | "success" = "failure";
  await page.route("**/api/datasets/*/profile", (route) => route.fulfill(mode === "failure"
    ? { status: 503, json: { code: "NOT_READY", message: "概况暂不可用", retryable: true, traceId: "profile" } }
    : { json: { ...example, dataset: mode === "invalid" ? example.dataset : flow.catalog.datasets.find((item) => item.version === flow.catalog.version)! } }));
  await page.goto("/?page=profile");
  await expect(page.getByRole("alert")).toContainText("概况暂不可用");
  await expect(page.locator(".source-profiles article")).toHaveCount(0);
  mode = "invalid";
  await page.getByRole("button", { name: "重试数据概况" }).click();
  await expect(page.getByRole("alert")).toContainText("版本与请求不一致");
  mode = "success";
  await page.getByRole("button", { name: "重试数据概况" }).click();
  await expect(page.locator(".source-profiles article")).toHaveCount(6);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("快速切换版本隔离迟到响应，刷新保留选择", async ({ page }) => {
  const state = await transport(page);
  const other = { ...example.dataset, version: "another-profile" };
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { ...flow.catalog, datasets: [...flow.catalog.datasets, other] } }));
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let first = true;
  await page.route("**/api/datasets/*/profile", async (route) => {
    const version = decodeURIComponent(new URL(route.request().url()).pathname.split("/")[3]!);
    if (version === other.version && first) {
      first = false;
      entered();
      await new Promise<void>((resolve) => { release = resolve; });
    }
    await route.fulfill({ json: { ...example, dataset: { ...example.dataset, version }, counts: { ...example.counts, orders: version === other.version ? 11111 : 22222 } } });
  });
  await page.goto("/?page=profile");
  await expect(page.locator(".dataset-facts")).toContainText("22,222");
  await page.getByLabel("查看数据集").selectOption(other.version);
  await started;
  await expect(page.locator(".dataset-facts")).not.toContainText("22,222");
  await page.getByLabel("查看数据集").selectOption(flow.catalog.version);
  await expect(page.locator(".dataset-facts")).toContainText("22,222");
  release();
  await expect(page.locator(".dataset-facts")).not.toContainText("11,111");
  await page.reload();
  await expect(page.getByLabel("查看数据集")).toHaveValue(flow.catalog.version);
  await expect(page.locator(".dataset-facts")).toContainText("22,222");
  expect(state.starts).toBe(0);
  expect(state.sessions).toBe(0);
});
