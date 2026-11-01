import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Report, Run, RunEvent } from "../../src/lib/types";

test("真实浏览器 → Vite → Fastify → PostgreSQL：支付、SSE、证据、刷新、历史与下载", async ({ page }, testInfo) => {
  const evidenceDir = "artifacts/http-only";
  await mkdir(evidenceDir, { recursive: true });
  const traffic: { method: string; path: string; status: number; body?: unknown }[] = [];
  const external: string[] = [];
  const errors: string[] = [];
  const events: RunEvent[] = [];
  await page.addInitScript(() => {
    (window as typeof window & { integrationFetch?: boolean }).integrationFetch = true;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) external.push(url.origin);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    const request = response.request();
    traffic.push({ method: request.method(), path: url.pathname + url.search,
      status: response.status(), ...(request.method() === "POST" ? { body: request.postDataJSON() } : {}) });
  });
  // No page.route, response fixtures, or provider simulation in this acceptance test.
  await page.goto("/?page=workspace");
  await expect(page.locator(".report")).toHaveCount(0);
  await expect(page.locator(".mode-notice")).toContainText("真实 PostgreSQL");
  const ready = await page.request.get("/api/health/ready");
  expect(await ready.json()).toEqual({ status: "ready", executionMode: "deterministic" });
  const catalog = await (await page.request.get("/api/catalog")).json();
  expect(catalog).toMatchObject({ version: "signals-v1", contractVersion: "1.2.0", synthetic: true, executionMode: "deterministic" });
  await page.getByRole("textbox", { name: "输入分析问题" }).fill("昨天华东支付金额为什么下降？");
  await page.getByRole("textbox", { name: "输入分析问题" }).press("Enter");
  await expect(page.locator(".report")).toBeVisible();
  await expect(page.locator(".hero-number")).toContainText("70,000");
  await expect(page.locator(".change-badge")).toContainText("30.0%");
  const reportId = new URL(page.url()).searchParams.get("report")!;
  expect(reportId).toBeTruthy();
  const report: Report = await (await page.request.get(`/api/reports/${reportId}`)).json();
  const run: Run = await (await page.request.get(`/api/runs/${report.runId}`)).json();
  expect(report.comparison).toEqual({ current: 7000000, baseline: 10000000, delta: -3000000, changeRate: -0.3 });
  expect(report.contributors.filter((c) => ["A", "B"].includes(c.key)).map((c) => [c.key, c.delta])).toEqual([["A", -4000000], ["B", 1000000]]);
  expect(report.provenance).toMatchObject({ executionMode: "deterministic", agentExecuted: false, modelId: null });
  expect(run.usage.modelRequests).toBe(0);
  expect(traffic.some((entry) => entry.method === "GET" && /\/api\/runs\/[^/]+\/events$/.test(entry.path))).toBe(true);
  const replay = await page.request.get(`/api/runs/${report.runId}/events`, { headers: { "Last-Event-ID": "0", Accept: "text/event-stream" } });
  expect(replay.status()).toBe(200);
  const sse = await replay.text();
  await writeFile(`${evidenceDir}/payment.sse`, sse);
  for (const match of sse.matchAll(/^data: (.+)$/gm)) events.push(JSON.parse(match[1]!) as RunEvent);
  expect(events.some((event) => event.type === "report.ready")).toBe(true);
  expect(events.at(-1)).toMatchObject({ type: "run.finished", payload: { status: "completed" } });
  expect(events.map((event) => event.seq)).toEqual([...new Set(events.map((event) => event.seq))].sort((a, b) => a - b));
  expect(traffic.find((entry) => entry.method === "POST" && entry.path.endsWith("/runs"))?.body).toEqual({ question: "昨天华东支付金额为什么下降？" });
  await page.getByRole("tab", { name: "明细", exact: true }).click();
  await expect(page.locator(".contribution-table")).toContainText("133.3%");
  await expect(page.locator(".contribution-table")).toContainText("−33.3%");
  // Every hypothesis exposes exactly its actual references, including three-evidence inventory support.
  const hypotheses = page.locator(".hypothesis-text");
  await expect(hypotheses).toHaveCount(report.hypotheses.length);
  for (const [index, hypothesis] of report.hypotheses.entries()) {
    expect(await hypotheses.nth(index).getByRole("button").allTextContents())
      .toEqual(hypothesis.evidenceIds.map((id) => report.evidences.find((e) => e.id === id)!.code));
  }
  await page.getByRole("button", { name: "查看分析口径", exact: true }).click();
  for (const evidence of report.evidences) {
    const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/evidences/${evidence.id}`);
    if (await page.getByLabel("切换证据", { exact: true }).inputValue() === evidence.id) {
      // Force a different selection so the actual evidence endpoint is requested again.
      await page.getByLabel("切换证据", { exact: true }).selectOption(report.evidences.find((e) => e.id !== evidence.id)!.id);
    }
    await page.getByLabel("切换证据", { exact: true }).selectOption(evidence.id);
    expect(await (await loaded).json()).toEqual(evidence);
    await expect(page.locator(".evidence-title").first()).toHaveText(evidence.title);
    await expect(page.locator(".query-details pre").first()).toHaveText(JSON.stringify(evidence.query, null, 2));
    expect(await page.locator(".evidence-table th").allTextContents()).toEqual(evidence.columns);
    await expect(page.locator(".evidence-table tbody tr")).toHaveCount(evidence.rows.length || 1);
    if (evidence.signal?.type === "inventory") {
      expect(evidence.query.filters.skuId).toEqual(["A"]);
      expect(evidence.signal.current).toEqual({ expectedHours: 24, observedHours: 24, zeroHours: 10, coverage: 1 });
      await expect(page.locator(".evidence-meta")).toContainText("24 / 24 池小时");
      await expect(page.locator(".stock-number")).toContainText("10池小时");
      await expect(page.locator(".inventory-section")).toContainText("不能推导具体缺货时段");
      await expect(page.locator(".inventory-section canvas")).toHaveCount(0);
      await expect(page.locator(".inventory-section .chart")).toHaveCount(0);
      await page.screenshot({ path: `${evidenceDir}/payment-inventory.png`, fullPage: true, animations: "disabled" });
    }
  }
  await page.screenshot({ path: `${evidenceDir}/payment-evidence.png`, fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".hero-number")).toContainText("70,000");
  expect(new URL(page.url()).searchParams.get("report")).toBe(report.id);
  await page.getByRole("button", { name: "历史报告", exact: true }).click();
  await page.locator(".history-list button").filter({ hasText: report.question }).first().click();
  await expect(page.locator(".hero-number")).toContainText("70,000");
  const downloaded: Record<string, string> = {};
  for (const format of ["json", "md"] as const) {
    await page.getByRole("button", { name: "导出报告", exact: true }).click();
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: format === "json" ? /JSON 数据/ : /Markdown 报告/ }).click();
    const download = await waiting;
    expect(download.suggestedFilename()).toBe(`Commerce-Lens-2026-10-21.${format}`);
    const path = `${evidenceDir}/payment.${format}`;
    await download.saveAs(path);
    downloaded[format] = await readFile(path, "utf8");
  }
  expect(JSON.parse(downloaded.json!)).toEqual(report);
  const blocks = [...downloaded.md!.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]!));
  for (const value of [report.query, report.comparison, report.contributors, ...report.evidences, report.trace]) {
    expect(blocks).toContainEqual(value);
  }
  expect(downloaded.md).toContain("Agent 执行：false");
  expect(downloaded.md).toContain("合成数据");
  const firstRunId = report.runId;
  const followup = page.getByRole("textbox", { name: "输入分析问题" });
  await followup.fill("按渠道进一步拆解");
  await followup.press("Enter");
  await expect(page.locator(".report")).toBeVisible();
  const followupId = new URL(page.url()).searchParams.get("report")!;
  const followupReport: Report = await (await page.request.get(`/api/reports/${followupId}`)).json();
  expect(followupReport.runId).not.toBe(firstRunId);
  expect(followupReport.query.groupBy).toBe("channel");
  expect(followupReport.comparison).toEqual(report.comparison);
  const followupPost = traffic.filter((entry) => entry.method === "POST" && entry.path.endsWith("/runs")).at(-1)!;
  expect(followupPost.body).toMatchObject({ question: "按渠道进一步拆解", parentRunId: firstRunId });
  await expect(page.locator(".report")).toContainText("变化来自哪些渠道");
  await expect(page.locator(".session-trail")).toContainText("2 轮分析");
  expect((await page.request.get("/api/sessions?limit=30")).status()).toBe(200);
  await page.reload();
  await expect(page.locator(".report")).toContainText("变化来自哪些渠道");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `${evidenceDir}/payment-report.png`, fullPage: true, animations: "disabled" });
  await writeFile(`${evidenceDir}/payment-browser.json`, JSON.stringify({
    verifiedAt: new Date().toISOString(), backendBusinessCommit: "6411a0b", backendHandoffCommit: "a250286",
    realBrowser: true, networkInterception: false, ready: await ready.json(), catalog, reportId: report.id,
    run, comparison: report.comparison, contributors: report.contributors, evidenceIds: report.evidences.map((e) => e.id),
    events, traffic, externalRequests: external, pageErrors: errors,
    followupReportId: followupId, followupQuery: followupReport.query,
  }, null, 2));
  await testInfo.attach("payment-browser", { path: `${evidenceDir}/payment-browser.json`, contentType: "application/json" });
});
