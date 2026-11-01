import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import type { Catalog, DatasetProfile, Report } from "../../src/lib/types";

test("真实概况读取、切换、刷新和旧报告恢复，不创建run", async ({ page }) => {
  const artifacts = "artifacts/frontend-profile-20261023";
  await mkdir(artifacts, { recursive: true });
  const traffic: { method: string; path: string; status: number }[] = [];
  const external: string[] = [];
  const errors: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) traffic.push({ method: response.request().method(), path: url.pathname + url.search, status: response.status() });
  });
  page.on("request", (request) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(request.url()).hostname)) external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  // No routes, fixtures or response replacement: all reads pass through Vite to Fastify/PostgreSQL.
  expect(await (await page.request.get("/api/health/ready")).json()).toEqual({ status: "ready", executionMode: "deterministic" });
  const catalog: Catalog = await (await page.request.get("/api/catalog")).json();
  expect(catalog.contractVersion).toBe("1.2.0");
  const profiles: DatasetProfile[] = [];
  for (const version of ["signals-v1", "acceptance-v1"]) {
    expect(catalog.datasets.some((dataset) => dataset.version === version)).toBe(true);
    const response = await page.request.get(`/api/datasets/${version}/profile`);
    expect(response.status()).toBe(200);
    const profile: DatasetProfile = await response.json();
    profiles.push(profile);
  }
  const signal = profiles[0]!;
  expect(signal.counts).toEqual({ orders: 4, orderItems: 6, refundEvents: 3, inventoryHours: 576, trafficDays: 24, promotionEvents: 1, skus: 3, channels: 3, regions: 4 });
  await page.goto("/?page=profile&dataset=signals-v1");
  await expect(page.locator(".source-profiles article")).toHaveCount(6);
  await expect(page.locator(".dataset-facts")).toContainText("总订单数（含支付失败）4支付成功订单数后端尚未提供");
  await expect(page.locator(".dataset-context")).toContainText(signal.lastCompleteDate!);
  for (const source of signal.sources) {
    const card = page.locator(`[data-source="${source.source}"]`);
    await expect(card.locator("dl > div").filter({ hasText: "实际记录数" }).locator("dd")).toHaveText(new Intl.NumberFormat("zh-CN").format(source.rowCount));
    await expect(card).toContainText(source.grain);
    if (source.checkedAt) await expect(card).toContainText(source.checkedAt);
  }
  await expect(page.locator(".profile-definitions article")).toHaveCount(signal.metrics.length);
  await page.screenshot({ path: `${artifacts}/profile-real-desktop.png` });
  await page.locator('[data-source="orders"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/profile-real-sources.png` });
  await page.locator(".profile-definitions").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/profile-real-metrics.png` });
  await page.getByLabel("查看数据集").selectOption("acceptance-v1");
  await expect(page.locator('[data-source="inventory"] .source-status')).toHaveText("缺少覆盖检查");
  await expect(page.locator('[data-source="inventory"]')).toContainText("实际记录数0");
  await expect(page.locator('[data-source="inventory"]')).toContainText("尚未检查");
  await page.reload();
  await expect(page.getByLabel("查看数据集")).toHaveValue("acceptance-v1");
  await expect(page.locator('[data-source="inventory"] .source-status')).toHaveText("缺少覆盖检查");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${artifacts}/profile-real-mobile.png` });
  await page.locator('[data-source="inventory"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/profile-real-mobile-missing.png` });
  await page.goto("/?page=profile&dataset=not-authorized");
  await expect(page.getByRole("alert")).toContainText("不在当前授权目录");
  await expect(page.locator(".source-profiles article")).toHaveCount(0);
  const history = await (await page.request.get("/api/sessions?limit=30")).json();
  expect(history.length).toBeGreaterThan(0);
  const saved: Report = await (await page.request.get(`/api/reports/${history[0].reportId}`)).json();
  await page.goto(`/?page=profile&dataset=acceptance-v1&report=${saved.id}`);
  await expect(page.locator(".report")).toBeVisible();
  await page.reload();
  await expect(page.locator(".report")).toBeVisible();
  expect((await (await page.request.get(`/api/reports/${saved.id}`)).json()).dataset.version).toBe(saved.dataset.version);
  await writeFile(`${artifacts}/profiles-real.json`, JSON.stringify(profiles, null, 2));
  await writeFile(`${artifacts}/profile-browser.json`, JSON.stringify({ catalog, traffic, external, errors, restoredReport: { id: saved.id, datasetVersion: saved.dataset.version }, modelRequestsCreated: 0 }, null, 2));
  expect(traffic.filter((request) => request.method !== "GET")).toEqual([]);
  expect(traffic.some((request) => request.path === "/api/datasets/signals-v1/profile" && request.status === 200)).toBe(true);
  expect(traffic.some((request) => request.path === "/api/datasets/acceptance-v1/profile" && request.status === 200)).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
