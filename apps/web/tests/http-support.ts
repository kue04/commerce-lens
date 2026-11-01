import { expect, type Page } from "@playwright/test";
import flow from "../../../packages/contracts/examples/payment-flow.json" with { type: "json" };
import profileExample from "../../../packages/contracts/examples/dataset-profile.json" with { type: "json" };
import type { Report, Run } from "../src/lib/types";

// Transport doubles only for fault/race regression; real integration uses a separate config.
export const report = structuredClone(flow.report) as Report;
export const otherReport: Report = { ...structuredClone(report), id: "other-report", runId: "other-run", sessionId: "other-session", title: "其他服务端报告" };
export function running(): Run {
  const { reportId: _report, endedAt: _end, ...run } = flow.run;
  return { ...run, status: "running" } as Run;
}
export async function transport(page: Page) {
  const state = { run: running(), events: ": waiting\n\n", starts: 0, sessions: 0, streams: 0, cancels: 0, questions: [] as unknown[] };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/catalog") return route.fulfill({ json: flow.catalog });
    if (/^\/api\/datasets\/[^/]+\/profile$/.test(path)) {
      const version = decodeURIComponent(path.split("/")[3]!);
      const dataset = flow.catalog.datasets.find((item) => item.version === version);
      if (dataset) return route.fulfill({ json: { ...profileExample, dataset, publishedAt: dataset.updatedAt } });
    }
    if (path === "/api/sessions") {
      if (request.method() === "POST") {
        state.sessions++;
        return route.fulfill({ status: 201, json: { sessionId: report.sessionId, datasetVersion: report.dataset.version } });
      }
      return route.fulfill({ json: [report, otherReport].map((r) => ({ sessionId: r.sessionId, reportId: r.id, title: r.title, question: r.question, createdAt: r.createdAt })) });
    }
    if (path.endsWith("/runs") && request.method() === "POST") {
      state.starts++;
      state.questions.push(request.postDataJSON());
      return route.fulfill({ status: 202, json: { runId: state.run.id, status: state.run.status, eventsUrl: `/api/runs/${state.run.id}/events` } });
    }
    if (path.endsWith("/cancel")) {
      state.cancels++;
      if (["running", "queued"].includes(state.run.status)) state.run = { ...state.run, status: "cancelled" };
      return route.fulfill({ json: state.run });
    }
    if (path.endsWith("/events")) {
      state.streams++;
      return route.fulfill({ contentType: "text/event-stream", body: state.events });
    }
    if (path === "/api/runs/example-run") return route.fulfill({ json: state.run });
    if (path.endsWith("/export")) return route.fulfill({ json: report });
    const matched = [report, otherReport].find((r) => path === `/api/reports/${r.id}`);
    if (matched) return route.fulfill({ json: matched });
    const evidence = report.evidences.find((e) => path === `/api/evidences/${e.id}`);
    if (evidence) return route.fulfill({ json: evidence });
    return route.fulfill({ status: 404, json: { ...flow.error, code: "NOT_FOUND", message: "报告或任务不存在" } });
  });
  return state;
}
export async function harness(page: Page, initialReport = true) {
  const state = await transport(page);
  await page.route("**/lifecycle-harness*", (route) => route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script type="module" src="/tests/http-lifecycle-harness.tsx"></script>' }));
  await page.goto(`/lifecycle-harness${initialReport ? `?report=${report.id}` : ""}`);
  await expect.poll(() => page.evaluate(() => Boolean(window.lifecycle?.current?.catalog && !window.lifecycle.current.loading))).toBe(true);
  if (initialReport) await expect.poll(() => page.evaluate(() => Boolean(window.lifecycle.current?.report))).toBe(true);
  return state;
}
