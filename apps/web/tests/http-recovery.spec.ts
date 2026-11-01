import { test, expect } from "@playwright/test";
import flow from "../../../packages/contracts/examples/payment-flow.json" with { type: "json" };

for (const reportSource of ["run", "details"] as const) {
  test(`SSE410使用${reportSource}的真实报告引用恢复，不消费虚构seq`, async ({ page }) => {
    let runReads = 0;
    let subscriptions = 0;
    const reportId = flow.report.id;
    await page.addInitScript(() => localStorage.setItem("commerce-lens:mode", "http"));
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/catalog") return route.fulfill({ json: flow.catalog });
      if (path === "/api/sessions") return route.fulfill({ json: [] });
      if (path === "/api/runs/example-run") {
        runReads++;
        if (runReads === 1) {
          const { reportId: _id, endedAt: _end, ...run } = flow.run;
          return route.fulfill({ json: { ...run, status: "running" } });
        }
        const { reportId: _id, ...run } = flow.run;
        return route.fulfill({ json: reportSource === "run" ? flow.run : run });
      }
      if (path.endsWith("/events")) {
        subscriptions++;
        expect(route.request().headers()["last-event-id"]).toBe("0");
        return route.fulfill({ status: 410, json: {
          code: "REPLAY_EXPIRED", message: "事件已过期", retryable: false, traceId: "recovery-test",
          details: { reportUrl: `/api/reports/${reportId}` },
        } });
      }
      if (path === `/api/reports/${reportId}`) return route.fulfill({ json: flow.report });
      return route.fulfill({ status: 404, json: flow.error });
    });
    await page.goto("/?run=example-run");
    await expect(page.locator(".hero-number")).toContainText("70,000");
    expect(new URL(page.url()).searchParams.get("report")).toBe(reportId);
    expect(subscriptions).toBe(1);
    await expect(page.getByText("多次重连失败", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "输入分析问题" })).toBeEnabled();
  });
}

test("SSE410查询终态等待时取消订阅，晚到结果无副作用", async ({ page }) => {
  await page.goto("/");
  await page.route("**/api/runs/example-run/events", (route) => route.fulfill({ status: 410, json: {
    code: "REPLAY_EXPIRED", message: "事件已过期", retryable: false, traceId: "cancel-test",
  } }));
  let release!: () => void;
  let entered!: () => void;
  const requested = new Promise<void>((resolve) => { entered = resolve; });
  await page.route("**/api/runs/example-run", async (route) => {
    entered();
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: flow.run });
  });
  await page.evaluate(async () => {
    const path = "/src/lib/api.ts";
    const { createApi } = await import(path);
    const state = window as typeof window & { recoveryStop?: () => void; snapshots?: number; recoveryFinished?: boolean };
    state.snapshots = 0;
    const api = createApi();
    const originalRun = api.run.bind(api);
    api.run = async (id: string) => {
      const result = await originalRun(id);
      state.recoveryFinished = true;
      return result;
    };
    state.recoveryStop = api.subscribe("example-run", 0, () => undefined,
      () => undefined, () => { state.snapshots!++; });
  });
  await requested;
  await page.evaluate(() => (window as typeof window & { recoveryStop: () => void }).recoveryStop());
  release();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { recoveryFinished?: boolean }).recoveryFinished)).toBe(true);
  expect(await page.evaluate(() => (window as typeof window & { snapshots: number }).snapshots)).toBe(0);
});
