import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import type { Evidence, Report, Run } from "../../src/lib/types";

test("one real DeepSeek Agent run; preserve browser, SSE, report, evidence and exports", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const dir = "artifacts/real-agent-20261023";
  await mkdir(dir, { recursive: true });
  const http: Array<{ method: string; path: string; status: number; requestBody?: unknown; responseBody?: unknown }> = [];
  const consoleErrors: string[] = [];
  const externalRequests: string[] = [];
  const pending: Promise<void>[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(url.origin);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    const request = response.request();
    const record: (typeof http)[number] = { method: request.method(), path: url.pathname + url.search, status: response.status() };
    try { if (request.method() === "POST") record.requestBody = request.postDataJSON(); } catch { /* Non-JSON body. */ }
    if (url.pathname.endsWith("/events") || url.pathname.endsWith("/export")) {
      http.push(record);
      return;
    }
    pending.push((async () => {
      try { record.responseBody = await response.json(); } catch { /* Empty/non-JSON response. */ }
      http.push(record);
    })());
  });

  let run: Run | undefined;
  let report: Report | undefined;
  try {
    await page.goto("/");
    await expect(page.locator(".mode-badge")).toContainText("真实 Agent");
    const ready = await page.request.get("/api/health/ready");
    expect(await ready.json()).toEqual({ status: "ready", executionMode: "agent" });
    const catalog = await (await page.request.get("/api/catalog")).json();
    expect(catalog).toMatchObject({ version: "signals-v1", executionMode: "agent", synthetic: true });
    await page.screenshot({ path: `${dir}/01-agent-ready.png`, fullPage: true, animations: "disabled" });

    const question = "昨天华东支付金额为什么下降？";
    const input = page.getByRole("textbox", { name: "输入分析问题" });
    await input.fill(question);
    await input.press("Enter");
    await expect(page.locator(".report, .clarification-state, .terminal-state").first()).toBeVisible({ timeout: 150_000 });
    await expect(page.locator(".running-state")).toHaveCount(0, { timeout: 150_000 });

    const reportId = new URL(page.url()).searchParams.get("report");
    const runId = new URL(page.url()).searchParams.get("run");
    if (reportId) {
      report = await (await page.request.get(`/api/reports/${reportId}`)).json() as Report;
      run = await (await page.request.get(`/api/runs/${report.runId}`)).json() as Run;
    } else if (runId) {
      run = await (await page.request.get(`/api/runs/${runId}`)).json() as Run;
    }
    await writeFile(`${dir}/question.json`, JSON.stringify({ question, catalog, ready: await ready.json(), reportId, runId }, null, 2));
    if (run) {
      await writeFile(`${dir}/run.json`, JSON.stringify(run, null, 2));
      const stream = await page.request.get(`/api/runs/${run.id}/events`, { headers: { "Last-Event-ID": "0", Accept: "text/event-stream" } });
      await writeFile(`${dir}/events.sse`, await stream.text());
    }
    if (!report || !run || !["completed", "partial"].includes(run.status)) {
      await writeFile(`${dir}/failure-state.json`, JSON.stringify({ run, visibleText: await page.locator("body").innerText(), http }, null, 2));
      throw new Error(`真实Agent链路未生成报告；run status=${run?.status ?? "unavailable"}`);
    }

    const eventsResponse = await page.request.get(`/api/runs/${run.id}/events`, { headers: { "Last-Event-ID": "0", Accept: "text/event-stream" } });
    expect(eventsResponse.status()).toBe(200);
    const sse = await eventsResponse.text();
    await writeFile(`${dir}/events.sse`, sse);
    const events = [...sse.matchAll(/^data: (.+)$/gm)].map((match) => JSON.parse(match[1]!));
    const evidences: Evidence[] = [];
    for (const ref of report.evidences) evidences.push(await (await page.request.get(`/api/evidences/${ref.id}`)).json() as Evidence);

    await page.screenshot({ path: `${dir}/02-agent-report.png`, fullPage: true, animations: "disabled" });
    const downloaded: Record<string, string> = {};
    for (const format of ["json", "md"] as const) {
      await page.getByRole("button", { name: "导出报告", exact: true }).click();
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("button", { name: format === "json" ? /JSON 数据/ : /Markdown 报告/ }).click();
      const download = await downloadEvent;
      const destination = `${dir}/report.${format}`;
      await download.saveAs(destination);
      downloaded[format] = destination;
    }
    await Promise.all(pending);
    const result = {
      completedAt: new Date().toISOString(),
      model: report.provenance.modelId,
      executionMode: report.provenance.executionMode,
      agentExecuted: report.provenance.agentExecuted,
      runUsage: run.usage,
      runStatus: run.status,
      report,
      evidences,
      events,
      browserHttp: http,
      exports: downloaded,
      externalRequests,
      consoleErrors,
    };
    await writeFile(`${dir}/real-agent.json`, JSON.stringify(result, null, 2));
    // Preserve a partial capture before failing the full business-acceptance gate.
    expect(run.status, "真实Agent必须成功调用submit_report；partial只算链路记录，不能算完整任务通过").toBe("completed");
    expect(report.trace.some((item) => item.name === "submit_report" && item.status === "success")).toBe(true);
    expect(report.provenance.executionMode).toBe("agent");
    expect(report.provenance.agentExecuted).toBe(true);
    expect(report.provenance.modelId).toBe("deepseek-flash");
    expect(run.usage.modelRequests).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "report.ready")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "run.finished", payload: { status: run.status } });
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await testInfo.attach("real-agent-run", { path: `${dir}/real-agent.json`, contentType: "application/json" });
  } catch (error) {
    await Promise.all(pending);
    await writeFile(`${dir}/partial-http.json`, JSON.stringify({ run, report, http, externalRequests, consoleErrors }, null, 2));
    throw error;
  }
});
