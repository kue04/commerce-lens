import { test, expect, type Response } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import type { Catalog, Overview, QuerySpec } from "../../src/lib/types";

test("真实概览读取：三周期三指标、授权筛选、缺数据、刷新及旧报告恢复，全程不创建run", async ({ page }) => {
  test.setTimeout(90_000);
  const artifacts = process.env.COMMERCE_LENS_OVERVIEW_ARTIFACTS ?? "artifacts/frontend-overview-http-20261023";
  await mkdir(artifacts, { recursive: true });
  const traffic: { method: string; path: string; status: number }[] = [];
  const records: { version: string; request: QuerySpec; response: Overview }[] = [];
  const external: string[] = [], errors: string[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/")) traffic.push({ method: response.request().method(), path, status: response.status() });
  });
  page.on("request", (request) => { if (!["localhost", "127.0.0.1"].includes(new URL(request.url()).hostname)) external.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  expect(await (await page.request.get("/api/health/ready")).json()).toEqual({ status: "ready", executionMode: "deterministic" });
  const catalog: Catalog = await (await page.request.get("/api/catalog")).json();
  expect(catalog.datasets.some((dataset) => dataset.version === "portfolio-90d-v1")).toBe(false);
  const fmt = (n: number | null, unit: "fen" | "units") => n === null ? "—" : unit === "fen"
    ? `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100)}` : `${new Intl.NumberFormat("zh-CN").format(n)} 件`;
  const isOverview = (response: Response) => /\/overview$/.test(response.url()) && response.request().method() === "POST";
  const read = async (action: () => Promise<unknown>, predicate: (query: QuerySpec) => boolean = () => true) => {
    const pending = page.waitForResponse((response) => isOverview(response) && predicate(response.request().postDataJSON()));
    await action();
    const response = await pending;
    expect(response.status()).toBe(200);
    const data: Overview = await response.json();
    records.push({ version: data.dataset.version, request: response.request().postDataJSON(), response: data });
    expect(data.executionMode).toBe("deterministic"); expect(data.agentExecuted).toBe(false);
    for (const metric of data.metrics) await expect(page.locator(`[data-metric="${metric.metricId}"] .overview-value`)).toHaveText(fmt(metric.comparison.current, metric.unit));
    await expect(page.locator(".overview-window")).toContainText(data.query.currentWindow.startDate);
    await expect(page.getByRole("heading", { name: /近30天日趋势/ })).toContainText(data.metrics.find((metric) => metric.metricId === data.query.metricId)!.label);
    expect(data.trend.points).toHaveLength(30);
    expect(data.changes.length).toBeLessThanOrEqual(5);
    return data;
  };
  // No route interception: Chromium -> Vite -> latest Fastify source -> existing PostgreSQL.
  const initial = await read(() => page.goto("/?dataset=signals-v1"));
  expect(initial.metrics.map((metric) => metric.comparison)).toEqual([
    { current: 7000000, baseline: 10000000, delta: -3000000, changeRate: -0.3 },
    { current: 300000, baseline: 0, delta: 300000, changeRate: null },
    { current: 70, baseline: 100, delta: -30, changeRate: -0.3 },
  ]);
  await expect(page.locator(".overview-changes")).toContainText("贡献份额 +133.3%");
  await expect(page.locator('[data-metric="refund_amount"]')).toContainText("基期为零");
  await expect(page.locator("#overview-filter-fields")).toBeHidden();
  const chartBox = await page.locator(".overview-trend-chart").boundingBox();
  expect(chartBox).not.toBeNull();
  expect(chartBox!.y + chartBox!.height).toBeLessThanOrEqual(960);
  const rulesBox = await page.locator(".overview-changes").boundingBox();
  expect(rulesBox!.y).toBeLessThan(chartBox!.y);
  await expect(page.getByLabel("查看数据集").locator("option:checked")).toHaveText("经营演示");
  await expect(page.locator(".overview-provenance")).not.toHaveAttribute("open", "");
  await page.getByText("数据与口径详情", { exact: true }).click();
  await expect(page.locator(".overview-provenance")).toContainText(initial.dataset.version);
  await expect(page.locator(".overview-provenance")).toContainText(initial.generatedAt);
  await page.getByText("数据与口径详情", { exact: true }).click();
  await page.locator(".report-scroll").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: `${artifacts}/overview-real-desktop.png`, fullPage: true });
  await page.locator(".overview-trend").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/overview-real-trend.png` });
  await page.locator(".overview-changes").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/overview-real-rules.png` });
  for (const days of [1, 7, 30]) {
    if (days !== 1) await read(() => page.getByLabel("比较周期").selectOption(String(days)));
    for (const [metricId, label] of [["refund_amount", "成功退款金额"], ["sold_units", "支付件数"], ["paid_amount", "支付金额"]] as const) {
      const data = await read(() => page.getByRole("button", { name: `${label}查看趋势` }).click());
      expect(data.query.metricId).toBe(metricId);
      expect(data.query.currentWindow.startDate).toBe(days === 1 ? "2026-10-21" : days === 7 ? "2026-10-15" : "2026-09-22");
      expect(data.trend.offsetDays).toBe(days === 30 ? 30 : 7);
    }
  }
  await read(() => page.getByLabel("比较周期").selectOption("1"));
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await read(() => page.getByLabel("渠道筛选").selectOption("douyin"));
  await read(() => page.getByLabel("大区筛选").selectOption("east"));
  const filtered = await read(() => page.getByLabel("SKU筛选").selectOption("A"));
  expect(filtered.query.filters).toEqual({ channelId: ["douyin"], regionId: ["east"], skuId: ["A"] });
  expect(filtered.metrics[0]!.comparison.current).toBe(2000000);
  expect(filtered.metrics[0]!.comparison.baseline).toBe(6000000);
  await page.locator(".overview-filter-toggle").click();
  await expect(page.locator(".overview-active-filters")).toContainText("食品 A");
  await expect(page.locator("#overview-filter-fields")).toBeHidden();
  await read(() => page.reload());
  await expect(page.getByLabel("SKU筛选")).toHaveValue("A");
  await expect(page.getByLabel("渠道筛选")).toHaveValue("douyin");
  await expect(page.getByLabel("大区筛选")).toHaveValue("east");
  await read(() => page.getByRole("button", { name: "清除筛选" }).click());
  const missing = await read(() => page.getByLabel("查看数据集").selectOption("scenario-S08-v1"));
  expect(missing.metrics[0]!.comparison.current).toBe(null);
  await expect(page.locator('[data-metric="paid_amount"]')).toContainText("覆盖不完整");
  await page.getByText("查看30天趋势数据表", { exact: true }).click();
  await expect(page.locator(".overview-trend-table tbody tr")).toHaveCount(30);
  await expect(page.locator(".overview-trend-table tbody tr").last()).toContainText("覆盖不完整");
  const quiet = await read(() => page.getByLabel("查看数据集").selectOption("scenario-S10-v1"));
  expect(quiet.changes).toEqual([]);
  await expect(page.locator(".overview-changes")).toContainText("当前范围没有触发规则提示");
  await read(() => page.getByLabel("查看数据集").selectOption("signals-v1"));
  // Rapid and repeated changes still settle on the final request, without new sessions/runs.
  await read(async () => {
    await page.getByLabel("比较周期").selectOption("7");
    await page.getByLabel("比较周期").selectOption("30");
    await page.getByLabel("比较周期").selectOption("1");
  }, (query) => query.currentWindow.startDate === "2026-10-21");
  await page.getByRole("button", { name: "支付金额查看趋势" }).click({ clickCount: 2 });
  await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥70,000.00");
  await read(() => page.reload());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("比较周期").focus();
  await expect(page.getByLabel("比较周期")).toBeFocused();
  await page.getByText("查看30天趋势数据表", { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${artifacts}/overview-real-mobile.png`, fullPage: true });
  const history = await (await page.request.get("/api/sessions?limit=30")).json();
  expect(history.length).toBeGreaterThan(0);
  await page.goto(`/?page=overview&dataset=not-authorized&days=30&report=${history[0].reportId}`);
  await expect(page.locator(".report")).toBeVisible();
  await page.reload();
  await expect(page.locator(".report")).toBeVisible();
  const saved = await (await page.request.get(`/api/reports/${history[0].reportId}`)).json();
  await page.goto(`/?page=overview&days=7&run=${saved.runId}`);
  await expect(page.locator(".report")).toBeVisible();
  await page.reload();
  await expect(page.locator(".report")).toBeVisible();
  expect(traffic.filter((request) => request.method !== "GET" && !request.path.endsWith("/overview"))).toEqual([]);
  expect(external).toEqual([]); expect(errors).toEqual([]);
  await writeFile(`${artifacts}/overview-browser.json`, JSON.stringify({ catalog, records, traffic, external, errors, restoredReport: saved.id, restoredRun: saved.runId, modelRequestsCreated: 0 }, null, 2));
});
