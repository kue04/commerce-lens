# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview-boundaries.spec.ts >> 错误和契约错配可重试，重试立即清空旧数据
- Location: tests\overview-boundaries.spec.ts:60:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.overview-trend')
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.overview-trend') with timeout 8000ms
  - waiting for locator('.overview-trend')

```

```yaml
- link "跳至主要内容":
  - /url: "#main-content"
- complementary:
  - link "Commerce Lens 经营概览":
    - /url: "#"
    - text: Commerce Lens
  - button "新建分析"
  - navigation "主导航":
    - button "经营概览"
    - button "数据概况"
    - button "分析工作台"
    - button "历史报告"
    - button "指标口径"
  - paragraph: 最近分析
  - button "支付金额变化分析"
  - button "其他服务端报告"
  - text: 禾 运营工作区 经营分析工作区
  - button "工作区与设置"
- banner:
  - text: 工作台 /
  - strong: 经营概览
  - button "查看当前店铺与工作区": 禾味食品演示店
  - text: 固定演示版本 2026-10-22
  - button "确定性计算 · 未执行 Agent"
- main:
  - text: 合成数据 · 真实 PostgreSQL · 确定性计算 · 未执行 Agent / 业务时钟 2026-10-22
  - region "经营概览":
    - text: BUSINESS OVERVIEW
    - heading "经营概览" [level=1]
    - paragraph: 固定演示版本，无自动同步；刷新不会生成新数据。
    - button "数据概况"
    - text: 查看数据集
    - combobox "查看数据集":
      - option "acceptance-v1" [selected]
    - text: 固定业务时钟
    - strong: 2026-10-22
    - text: 完整截至日期
    - strong: 2026-10-21
    - text: 比较周期
    - combobox "比较周期":
      - option "昨天 · 对上周同日" [selected]
      - option "近7天 · 对前7天"
      - option "近30天 · 对前30天"
    - text: 渠道筛选
    - combobox "渠道筛选":
      - option "全部渠道" [selected]
      - option "抖音（douyin）"
      - option "京东（jd）"
      - option "天猫（tmall）"
    - text: 大区筛选
    - combobox "大区筛选":
      - option "全部大区" [selected]
      - option "华东（east）"
      - option "华北（north）"
      - option "华南（south）"
      - option "西部（west）"
    - text: SKU筛选
    - combobox "SKU筛选":
      - option "全部SKU" [selected]
      - option "坚果 1（SKU-01）"
      - option "饼干 2（SKU-02）"
      - option "果干 3（SKU-03）"
      - option "坚果 4（SKU-04）"
      - option "饼干 5（SKU-05）"
      - option "果干 6（SKU-06）"
      - option "坚果 7（SKU-07）"
      - option "饼干 8（SKU-08）"
      - option "果干 9（SKU-09）"
      - option "坚果 10（SKU-10）"
      - option "饼干 11（SKU-11）"
      - option "果干 12（SKU-12）"
      - option "坚果 13（SKU-13）"
      - option "饼干 14（SKU-14）"
      - option "果干 15（SKU-15）"
      - option "坚果 16（SKU-16）"
      - option "饼干 17（SKU-17）"
      - option "果干 18（SKU-18）"
      - option "坚果 19（SKU-19）"
      - option "饼干 20（SKU-20）"
      - option "果干 21（SKU-21）"
      - option "坚果 22（SKU-22）"
      - option "饼干 23（SKU-23）"
      - option "果干 24（SKU-24）"
      - option "坚果 25（SKU-25）"
      - option "饼干 26（SKU-26）"
      - option "果干 27（SKU-27）"
      - option "坚果 28（SKU-28）"
      - option "饼干 29（SKU-29）"
      - option "果干 30（SKU-30）"
    - button "清除筛选" [disabled]
    - alert:
      - strong: 经营概览读取失败
      - paragraph: 接口数据不符合共享 HTTP 契约 v1.2.0
      - button "重试经营概览"
    - article:
      - heading "支付金额 查看趋势" [level=2]:
        - button "支付金额 查看趋势" [pressed]
      - paragraph: 尚未取得
    - article:
      - heading "成功退款金额 查看趋势" [level=2]:
        - button "成功退款金额 查看趋势"
      - paragraph: 尚未取得
    - article:
      - heading "支付件数 查看趋势" [level=2]:
        - button "支付件数 查看趋势"
      - paragraph: 尚未取得
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
> 75  |   await expect(page.locator(".overview-trend")).toBeVisible();
      |                                                 ^ Error: expect(locator).toBeVisible() failed
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
  98  |   await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥70,000.00");
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