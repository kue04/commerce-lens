import { test, expect, type Route } from "@playwright/test";
import example from "../../../packages/contracts/examples/overview.json" with { type: "json" };
import flow from "../../../packages/contracts/examples/payment-flow.json" with { type: "json" };
import type { Overview, QuerySpec, Catalog } from "../src/lib/types";
import { transport } from "./http-support";

// Test-only transport: missing/zero/invalid responses and delayed network boundaries.
function response(route: Route): Overview {
  const query = route.request().postDataJSON() as QuerySpec;
  return { ...structuredClone(example.response) as Overview, query,
    dataset: structuredClone(flow.catalog.datasets.find((item) => item.version === flow.catalog.version)!) as Catalog["datasets"][number],
    trend: { ...structuredClone(example.response.trend) as Overview["trend"], metricId: query.metricId as Overview["trend"]["metricId"] } };
}

test("缺失侧不补零，零基期不造变化率，空规则和趋势缺口提供原因", async ({ page }) => {
  const state = await transport(page);
  await page.route("**/api/datasets/*/overview", (route) => {
    const data = response(route);
    data.metrics[0]!.comparison = { current: null, baseline: 0, delta: null, changeRate: null };
    data.metrics[0]!.availability = { available: false, reason: "订单分区缺失" };
    data.availability = data.metrics[0]!.availability;
    data.changes = [];
    data.trend.points[29]!.comparison = { current: null, baseline: 0, delta: null, changeRate: null };
    data.trend.points[29]!.currentAvailability = data.availability;
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("—");
  await expect(page.locator('[data-metric="paid_amount"]')).toContainText("基期为零，变化率不可计算");
  await expect(page.locator(".overview-changes")).toContainText("数据不足，无法给出规则提示");
  await page.getByText("查看30天趋势数据表", { exact: true }).click();
  await expect(page.locator(".overview-trend-table tbody tr")).toHaveCount(30);
  await expect(page.locator(".overview-trend-table tbody tr").last()).toContainText("订单分区缺失");
  expect(state.starts).toBe(0); expect(state.sessions).toBe(0);
});

test("无规则时保留真实零，负贡献和超100%份额原样展示", async ({ page }) => {
  await transport(page);
  let empty = true;
  await page.route("**/api/datasets/*/overview", (route) => {
    const data = response(route);
    if (empty) {
      data.changes = [];
      data.metrics[0]!.comparison = { current: 0, baseline: 0, delta: 0, changeRate: null };
    } else {
      const change = data.changes.find((item) => item.contributor)!;
      change.contributor!.share = -1.3333333333333333;
      data.changes = [change];
    }
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥0.00");
  await expect(page.locator(".overview-changes")).toContainText("当前范围没有触发规则提示");
  empty = false;
  await page.getByLabel("比较周期").selectOption("7");
  await expect(page.locator(".overview-changes")).toContainText("贡献份额 −133.3%");
});

test("错误和契约错配可重试，重试立即清空旧数据", async ({ page }) => {
  await transport(page);
  let mode: "failure" | "invalid" | "success" = "failure";
  await page.route("**/api/datasets/*/overview", (route) => {
    const data = response(route);
    if (mode === "invalid") data.dataset.version = "foreign";
    return route.fulfill(mode === "failure" ? { status: 503, json: { ...flow.error, message: "概览暂不可用" } } : { json: data });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("概览暂不可用");
  mode = "invalid";
  await page.getByRole("button", { name: "重试经营概览" }).click();
  await expect(page.getByRole("alert")).toContainText("概览范围与请求不一致");
  mode = "success";
  await page.getByRole("button", { name: "重试经营概览" }).click();
  await expect(page.locator(".overview-trend")).toBeVisible();
  mode = "failure";
  await page.getByLabel("比较周期").selectOption("30");
  await expect(page.getByRole("alert")).toContainText("概览暂不可用");
  await expect(page.locator(".overview-value, .overview-trend, .overview-changes")).toHaveCount(0);
});

test("快速A→B→A切换与重复点击隔离迟到概览，离页不泄漏", async ({ page }) => {
  const state = await transport(page);
  const expected = `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(example.response.metrics[0]!.comparison.current! / 100)}`;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let held = false;
  await page.route("**/api/datasets/*/overview", async (route) => {
    const data = response(route);
    if (data.query.metricId === "sold_units" && !held) {
      held = true; entered();
      await new Promise<void>((resolve) => { release = resolve; });
      data.metrics[0]!.comparison.current = 999999;
    }
    await route.fulfill({ json: data }).catch(() => undefined);
  });
  await page.goto("/");
  await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText(expected);
  await page.getByRole("button", { name: "支付件数查看趋势" }).click();
  await started;
  await expect(page.locator(".overview-value")).toHaveCount(0);
  await page.getByRole("button", { name: "支付金额查看趋势" }).click();
  await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText(expected);
  await page.getByRole("button", { name: "支付金额查看趋势" }).click({ clickCount: 2 });
  release();
  await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText(expected);
  await page.getByRole("button", { name: "数据概况", exact: true }).last().click();
  await expect(page.locator(".overview-panel")).toHaveCount(0);
  expect(state.sessions).toBe(0); expect(state.starts).toBe(0);
});

test("URL越权筛选不发概览请求，清除后可恢复", async ({ page }) => {
  await transport(page);
  let requests = 0;
  await page.route("**/api/datasets/*/overview", (route) => { requests++; return route.fulfill({ json: response(route) }); });
  await page.goto("/?sku=not-authorized&days=7");
  await expect(page.getByRole("alert")).toContainText("授权字典");
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.locator(".overview-trend")).toBeVisible();
  expect(requests).toBe(1);
});
