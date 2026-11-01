# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview-boundaries.spec.ts >> 快速A→B→A切换与重复点击隔离迟到概览，离页不泄漏
- Location: tests\overview-boundaries.spec.ts:82:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('[data-metric="paid_amount"] .overview-value')
Expected: "¥70,000.00"
Received: "¥118,619.93"
Timeout:  8000ms

Call log:
  - Expect "toHaveText" locator('[data-metric="paid_amount"] .overview-value') with timeout 8000ms
  - waiting for locator('[data-metric="paid_amount"] .overview-value')
    19 × locator resolved to <p class="overview-value">¥118,619.93</p>
       - unexpected value "¥118,619.93"

```

```yaml
- paragraph: ¥118,619.93
```

# Test source

```ts
  1   | import { test, expect, type Route } from "@playwright/test";
  2   | import example from "../../../packages/contracts/examples/overview.json" with { type: "json" };
  3   | import flow from "../../../packages/contracts/examples/payment-flow.json" with { type: "json" };
  4   | import type { Overview, QuerySpec } from "../src/lib/types";
  5   | import { transport } from "./http-support";
  6   | 
  7   | // Test-only transport: missing/zero/invalid responses and delayed network boundaries.
  8   | function response(route: Route): Overview {
  9   |   const query = route.request().postDataJSON() as QuerySpec;
  10  |   return { ...structuredClone(example.response) as Overview, query,
  11  |     dataset: flow.catalog.datasets.find((item) => item.version === flow.catalog.version)!,
  12  |     trend: { ...structuredClone(example.response.trend) as Overview["trend"], metricId: query.metricId } };
  13  | }
  14  | 
  15  | test("缺失侧不补零，零基期不造变化率，空规则和趋势缺口提供原因", async ({ page }) => {
  16  |   const state = await transport(page);
  17  |   await page.route("**/api/datasets/*/overview", (route) => {
  18  |     const data = response(route);
  19  |     data.metrics[0]!.comparison = { current: null, baseline: 0, delta: null, changeRate: null };
  20  |     data.metrics[0]!.availability = { available: false, reason: "订单分区缺失" };
  21  |     data.availability = data.metrics[0]!.availability;
  22  |     data.changes = [];
  23  |     data.trend.points[29]!.comparison = { current: null, baseline: 0, delta: null, changeRate: null };
  24  |     data.trend.points[29]!.currentAvailability = data.availability;
  25  |     return route.fulfill({ json: data });
  26  |   });
  27  |   await page.goto("/");
  28  |   await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("—");
  29  |   await expect(page.locator('[data-metric="paid_amount"]')).toContainText("基期为零，变化率不可计算");
  30  |   await expect(page.locator(".overview-changes")).toContainText("数据不足，无法给出规则提示");
  31  |   await page.getByText("查看30天趋势数据表", { exact: true }).click();
  32  |   await expect(page.locator(".overview-trend-table tbody tr")).toHaveCount(30);
  33  |   await expect(page.locator(".overview-trend-table tbody tr").last()).toContainText("订单分区缺失");
  34  |   expect(state.starts).toBe(0); expect(state.sessions).toBe(0);
  35  | });
  36  | 
  37  | test("无规则时保留真实零，负贡献和超100%份额原样展示", async ({ page }) => {
  38  |   await transport(page);
  39  |   let empty = true;
  40  |   await page.route("**/api/datasets/*/overview", (route) => {
  41  |     const data = response(route);
  42  |     if (empty) {
  43  |       data.changes = [];
  44  |       data.metrics[0]!.comparison = { current: 0, baseline: 0, delta: 0, changeRate: null };
  45  |     } else {
  46  |       const change = data.changes.find((item) => item.contributor)!;
  47  |       change.contributor!.share = -1.3333333333333333;
  48  |       data.changes = [change];
  49  |     }
  50  |     return route.fulfill({ json: data });
  51  |   });
  52  |   await page.goto("/");
  53  |   await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥0.00");
  54  |   await expect(page.locator(".overview-changes")).toContainText("当前范围没有触发规则提示");
  55  |   empty = false;
  56  |   await page.getByLabel("比较周期").selectOption("7");
  57  |   await expect(page.locator(".overview-changes")).toContainText("贡献份额 −133.3%");
  58  | });
  59  | 
  60  | test("错误和契约错配可重试，重试立即清空旧数据", async ({ page }) => {
  61  |   await transport(page);
  62  |   let mode: "failure" | "invalid" | "success" = "failure";
  63  |   await page.route("**/api/datasets/*/overview", (route) => {
  64  |     const data = response(route);
  65  |     if (mode === "invalid") data.dataset.version = "foreign";
  66  |     return route.fulfill(mode === "failure" ? { status: 503, json: { ...flow.error, message: "概览暂不可用" } } : { json: data });
  67  |   });
  68  |   await page.goto("/");
  69  |   await expect(page.getByRole("alert")).toContainText("概览暂不可用");
  70  |   mode = "invalid";
  71  |   await page.getByRole("button", { name: "重试经营概览" }).click();
  72  |   await expect(page.getByRole("alert")).toContainText("概览范围与请求不一致");
  73  |   mode = "success";
  74  |   await page.getByRole("button", { name: "重试经营概览" }).click();
  75  |   await expect(page.locator(".overview-trend")).toBeVisible();
  76  |   mode = "failure";
  77  |   await page.getByLabel("比较周期").selectOption("30");
  78  |   await expect(page.getByRole("alert")).toContainText("概览暂不可用");
  79  |   await expect(page.locator(".overview-value, .overview-trend, .overview-changes")).toHaveCount(0);
  80  | });
  81  | 
  82  | test("快速A→B→A切换与重复点击隔离迟到概览，离页不泄漏", async ({ page }) => {
  83  |   const state = await transport(page);
  84  |   let release!: () => void;
  85  |   let entered!: () => void;
  86  |   const started = new Promise<void>((resolve) => { entered = resolve; });
  87  |   let held = false;
  88  |   await page.route("**/api/datasets/*/overview", async (route) => {
  89  |     const data = response(route);
  90  |     if (data.query.metricId === "sold_units" && !held) {
  91  |       held = true; entered();
  92  |       await new Promise<void>((resolve) => { release = resolve; });
  93  |       data.metrics[0]!.comparison.current = 999999;
  94  |     }
  95  |     await route.fulfill({ json: data }).catch(() => undefined);
  96  |   });
  97  |   await page.goto("/");
> 98  |   await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥70,000.00");
      |                                                                             ^ Error: expect(locator).toHaveText(expected) failed
  99  |   await page.getByRole("button", { name: "支付件数查看趋势" }).click();
  100 |   await started;
  101 |   await expect(page.locator(".overview-value")).toHaveCount(0);
  102 |   await page.getByRole("button", { name: "支付金额查看趋势" }).click();
  103 |   await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥70,000.00");
  104 |   await page.getByRole("button", { name: "支付金额查看趋势" }).click({ clickCount: 2 });
  105 |   release();
  106 |   await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥70,000.00");
  107 |   await page.getByRole("button", { name: "数据概况", exact: true }).last().click();
  108 |   await expect(page.locator(".overview-panel")).toHaveCount(0);
  109 |   expect(state.sessions).toBe(0); expect(state.starts).toBe(0);
  110 | });
  111 | 
  112 | test("URL越权筛选不发概览请求，清除后可恢复", async ({ page }) => {
  113 |   await transport(page);
  114 |   let requests = 0;
  115 |   await page.route("**/api/datasets/*/overview", (route) => { requests++; return route.fulfill({ json: response(route) }); });
  116 |   await page.goto("/?sku=not-authorized&days=7");
  117 |   await expect(page.getByRole("alert")).toContainText("授权字典");
  118 |   expect(requests).toBe(0);
  119 |   await page.getByRole("button", { name: "清除筛选" }).click();
  120 |   await expect(page.locator(".overview-trend")).toBeVisible();
  121 |   expect(requests).toBe(1);
  122 | });
  123 | 
```