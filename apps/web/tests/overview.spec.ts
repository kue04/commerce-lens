import { test, expect } from "@playwright/test";
import flow from "../../../packages/contracts/examples/payment-flow.json" with { type: "json" };
import { report, transport } from "./http-support";

test("默认概览接口失败不补零或回退，不发起分析", async ({ page }, testInfo) => {
  const state = await transport(page);
  const requests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "经营概览", exact: true })).toBeVisible();
  await expect(page.getByLabel("查看数据集", { exact: true })).toHaveValue(flow.catalog.version);
  await expect(page.locator(".overview-metrics article")).toHaveCount(3);
  await expect(page.getByRole("alert")).toContainText("经营概览读取失败");
  await expect(page.locator(".metric-unavailable")).toHaveText(["尚未取得", "尚未取得", "尚未取得"]);
  await expect(page.locator(".data-freshness")).toContainText("固定演示版本");
  await expect(page.getByText("数据已更新", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("overview-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "数据概况", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "先了解数据，再看经营。" })).toBeVisible();
  await expect(page.locator(".dataset-facts")).toContainText(flow.catalog.updatedAt);
  await expect(page.locator(".dataset-facts")).toContainText("总订单数（含支付失败）100,000支付成功订单数后端尚未提供");
  await page.screenshot({ path: testInfo.outputPath("profile-desktop.png"), fullPage: true });
  await expect(page.getByRole("button", { name: /导入/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "先了解数据，再看经营。" })).toBeVisible();
  expect(state.starts).toBe(0);
  expect(state.sessions).toBe(0);
  expect(requests.every((request) => ["GET /api/catalog", "GET /api/sessions"].includes(request) || /^GET \/api\/datasets\/[^/]+\/profile$/.test(request) || /^POST \/api\/datasets\/[^/]+\/overview$/.test(request))).toBe(true);
});

test("授权目录的版本选择可刷新恢复，未知版本不回退", async ({ page }) => {
  const state = await transport(page);
  const other = { ...flow.catalog.datasets[0]!, version: "another-authorized-version", businessClock: "2026-09-12" };
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { ...flow.catalog, datasets: [...flow.catalog.datasets, other] } }));
  await page.goto("/");
  await page.getByLabel("查看数据集", { exact: true }).selectOption(other.version);
  await expect(page.locator(".dataset-context")).toContainText(other.businessClock);
  await page.reload();
  await expect(page.getByLabel("查看数据集", { exact: true })).toHaveValue(other.version);
  await page.goto("/?page=profile&dataset=not-authorized");
  await expect(page.getByRole("alert")).toContainText("不在当前授权目录");
  await expect(page.locator(".dataset-facts")).not.toContainText(flow.catalog.version);
  await expect(page.getByLabel("查看数据集", { exact: true })).toHaveValue("not-authorized");
  expect(state.starts).toBe(0);
  expect(state.sessions).toBe(0);
});

test("概览参数不遮蔽原报告恢复，离开报告后刷新保持概况", async ({ page }) => {
  await transport(page);
  await page.goto(`/?page=overview&dataset=not-authorized&report=${report.id}`);
  await expect(page.locator(".hero-number")).toContainText("70,000");
  await page.getByRole("button", { name: "数据概况", exact: true }).click();
  expect(new URL(page.url()).searchParams.has("report")).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "先了解数据，再看经营。" })).toBeVisible();
});

test("移动端概览和概况可键盘使用且不横向溢出", async ({ page }, testInfo) => {
  await transport(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const select = page.getByLabel("查看数据集", { exact: true });
  await expect(select).toBeEnabled();
  await select.focus();
  await expect(select).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("overview-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "数据概况", exact: true }).last().click();
  await expect(page.locator(".dataset-facts")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("profile-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
