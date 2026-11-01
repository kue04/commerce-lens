import { test, expect } from "@playwright/test";
import flow from "../../../packages/contracts/examples/payment-flow.json" with { type: "json" };
import { harness, otherReport, report, running } from "./http-support";
import type { RunEvent } from "../src/lib/types";

test("HTTP同帧重复提交只创建一次，提交同帧新建不能解除运行锁", async ({ page }) => {
  const state = await harness(page, false);
  const result = await page.evaluate(async () => {
    const w = window.lifecycle.current!;
    const first = w.submit("昨天华东支付金额为什么下降？");
    const duplicate = w.submit("昨天华东支付金额为什么下降？");
    const fresh = w.fresh();
    return { accepted: await first, duplicate: await duplicate, fresh };
  });
  expect(result).toEqual({ accepted: true, duplicate: false, fresh: false });
  expect(state.starts).toBe(1);
  expect(state.questions).toEqual([{ question: "昨天华东支付金额为什么下降？" }]);
});
test("HTTP活动任务后退保留run URL，禁止打开其他会话", async ({ page }) => {
  await harness(page, false);
  await page.evaluate(async () => {
    await window.lifecycle.current!.submit("昨天华东支付金额为什么下降？");
    history.pushState(null, "", "?");
    dispatchEvent(new PopStateEvent("popstate"));
    await window.lifecycle.current!.openReport("other-report");
  });
  expect(new URL(page.url()).searchParams.get("run")).toBe("example-run");
  expect(await page.evaluate(() => window.lifecycle.current?.run?.status)).toBe("running");
  expect(await page.evaluate(() => window.lifecycle.current?.report)).toBeNull();
});
test("HTTP空闲URL导航清空旧报告，显式report URL可恢复", async ({ page }) => {
  await harness(page);
  await page.evaluate(() => { history.pushState(null, "", "?"); dispatchEvent(new PopStateEvent("popstate")); });
  await expect.poll(() => page.evaluate(() => window.lifecycle.current?.report)).toBeNull();
  await page.evaluate((id) => { history.pushState(null, "", `?report=${id}`); dispatchEvent(new PopStateEvent("popstate")); }, report.id);
  await expect.poll(() => page.evaluate(() => window.lifecycle.current?.report?.id)).toBe(report.id);
});
test("取消终态可从服务器run URL恢复，不依赖浏览器缓存", async ({ page }) => {
  const state = await harness(page, false);
  state.run.status = "cancelled";
  await page.evaluate(() => { history.pushState(null, "", "?run=example-run"); dispatchEvent(new PopStateEvent("popstate")); });
  await expect.poll(() => page.evaluate(() => window.lifecycle.current?.run?.status)).toBe("cancelled");
  expect(await page.evaluate(() => window.lifecycle.current?.busy)).toBe(false);
});
test("旧running重连快照晚于取消，不能反转终态", async ({ page }) => {
  await harness(page, false);
  await page.evaluate(async () => {
    await window.lifecycle.current!.submit("昨天华东支付金额为什么下降？");
    const w = window.lifecycle.current!;
    const original = w.api.run.bind(w.api);
    const stale = await original("example-run");
    w.api.run = () => new Promise((resolve) => { window.lifecycle.release = () => resolve(stale); });
    void w.reconnect();
    await w.cancel();
  });
  await page.evaluate(() => window.lifecycle.release!());
  await expect.poll(() => page.evaluate(() => window.lifecycle.current?.run?.status)).toBe("cancelled");
  expect(await page.evaluate(() => window.lifecycle.current?.busy)).toBe(false);
});
for (const stage of ["session", "start"] as const) {
  test(`HTTP ${stage}请求等待时卸载，晚到响应不订阅、不改URL、不取消`, async ({ page }) => {
    const state = await harness(page, false);
    await page.evaluate(async (waitingStage) => {
      const w = window.lifecycle.current!;
      if (waitingStage === "session") {
        const original = w.api.createSession.bind(w.api);
        w.api.createSession = async () => {
          const result = await original();
          return new Promise((resolve) => { window.lifecycle.release = () => resolve(result); });
        };
      } else {
        const original = w.api.start.bind(w.api);
        w.api.start = async (...args) => {
          const result = await original(...args);
          return new Promise((resolve) => { window.lifecycle.release = () => resolve(result); });
        };
      }
      void w.submit("昨天华东支付金额为什么下降？");
    }, stage);
    await expect.poll(() => page.evaluate(() => Boolean(window.lifecycle.release))).toBe(true);
    const url = page.url();
    await page.evaluate(() => { window.lifecycle.unmount(); window.lifecycle.release!(); });
    expect(page.url()).toBe(url);
    expect(state.starts).toBe(stage === "session" ? 0 : 1);
    expect(state.streams).toBe(0);
    expect(state.cancels).toBe(0);
  });
}
test("活动卸载只断开订阅，后台完成后StrictMode重挂载从服务器恢复", async ({ page }) => {
  const state = await harness(page, false);
  await page.evaluate(async () => { await window.lifecycle.current!.submit("昨天华东支付金额为什么下降？"); });
  const url = page.url();
  await page.evaluate(() => window.lifecycle.unmount());
  state.run = structuredClone(flow.run) as typeof state.run;
  expect(state.cancels).toBe(0);
  expect(page.url()).toBe(url);
  await page.evaluate(() => window.lifecycle.mount());
  await expect.poll(() => page.evaluate(() => window.lifecycle.current?.report?.id)).toBe(report.id);
  expect(new URL(page.url()).searchParams.get("report")).toBe(report.id);
});
test("旧报告请求晚到不能覆盖新会话与查询上下文", async ({ page }) => {
  await harness(page);
  await page.evaluate(async () => {
    const w = window.lifecycle.current!;
    const original = w.api.report.bind(w.api);
    w.api.report = async (id) => {
      const result = await original(id);
      return id === "other-report" ? new Promise((resolve) => { window.lifecycle.release = () => resolve(result); }) : result;
    };
    void w.openReport("other-report");
  });
  await expect.poll(() => page.evaluate(() => Boolean(window.lifecycle.release))).toBe(true);
  await page.evaluate(async (id) => { await window.lifecycle.current!.openReport(id); window.lifecycle.release!(); }, report.id);
  await expect.poll(() => page.evaluate(() => window.lifecycle.current?.report?.id)).toBe(report.id);
});
for (const action of ["switch", "unmount"] as const) {
  test(`导出等待时${action}，迟到结果不下载、不影响新状态`, async ({ page }) => {
    await harness(page);
    await page.evaluate(async (next) => {
      const w = window.lifecycle.current!;
      window.lifecycle.downloads = 0;
      HTMLAnchorElement.prototype.click = () => { window.lifecycle.downloads!++; };
      let finish!: () => void;
      w.api.export = () => new Promise((resolve) => { finish = () => resolve(new Blob(["delayed"])); });
      const pending = w.download("json");
      window.lifecycle.release = async () => { finish(); await pending; };
      if (next === "switch") await w.openReport("other-report"); else window.lifecycle.unmount();
    }, action);
    await page.evaluate(async () => { await window.lifecycle.release!(); });
    expect(await page.evaluate(() => window.lifecycle.downloads)).toBe(0);
    if (action === "switch") {
      expect(await page.evaluate(() => window.lifecycle.current?.report?.id)).toBe(otherReport.id);
      expect(await page.evaluate(() => window.lifecycle.current?.exporting)).toBe(false);
    }
  });
}
for (const defect of ["no-report", "wrong-run"] as const) {
  test(`HTTP completed记录${defect}时阻止展示且释放运行锁`, async ({ page }) => {
    const state = await harness(page, false);
    state.run = structuredClone(flow.run) as typeof state.run;
    if (defect === "no-report") delete state.run.reportId;
    else await page.route(`**/api/reports/${report.id}`, (route) => route.fulfill({ json: { ...report, runId: "foreign-run" } }));
    await page.evaluate(async () => { await window.lifecycle.current!.submit("昨天华东支付金额为什么下降？"); });
    await expect.poll(() => page.evaluate(() => window.lifecycle.current?.error)).toMatch(/记录不完整/);
    expect(await page.evaluate(() => window.lifecycle.current?.report)).toBeNull();
    expect(await page.evaluate(() => window.lifecycle.current?.busy)).toBe(false);
  });
}
test("取消订阅后同一网络块余下事件不回调", async ({ page }) => {
  const state = await harness(page, false);
  state.events = flow.events.map((e) => `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const seen = await page.evaluate(async () => {
    const path = "/src/lib/api.ts";
    const { createApi } = await import(path);
    const seen: string[] = [];
    await new Promise<void>((resolve) => {
      const stop = createApi().subscribe("example-run", 0, (event: RunEvent) => { seen.push(event.type); stop(); queueMicrotask(resolve); }, () => undefined, () => undefined);
    });
    return seen;
  });
  expect(seen).toEqual(["run.started"]);
});
test("report.ready不是终态，取消后不展示迟到报告", async ({ page }) => {
  const state = await harness(page, false);
  const ready: RunEvent = { runId: "example-run", seq: 1, type: "report.ready", at: flow.run.createdAt, payload: { reportId: report.id, status: "completed" } };
  state.events = `id: 1\ndata: ${JSON.stringify(ready)}\n\n`;
  await page.evaluate(async () => { await window.lifecycle.current!.submit("昨天华东支付金额为什么下降？"); });
  await expect.poll(() => page.evaluate(() => window.lifecycle.current?.run?.reportId)).toBe(report.id);
  expect(await page.evaluate(() => window.lifecycle.current?.report)).toBeNull();
  await page.evaluate(async () => { await window.lifecycle.current!.cancel(); });
  expect(await page.evaluate(() => window.lifecycle.current?.run?.status)).toBe("cancelled");
  expect(await page.evaluate(() => window.lifecycle.current?.report)).toBeNull();
});
