import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import flow from "../../../packages/contracts/examples/payment-flow.json";
import profileExample from "../../../packages/contracts/examples/dataset-profile.json";
import overviewExample from "../../../packages/contracts/examples/overview.json";
import { createApi, parseEvent, validateReport } from "../src/lib/api";
import { pageFromUrl } from "../src/lib/navigation";
import { metricValue, money, rate } from "../src/lib/format";
import { evidenceCell, phaseIndex } from "../src/lib/selectors";
import { clarificationQuery } from "../src/lib/presentation";
import type { Report, Overview, DatasetProfile } from "../src/lib/types";
import { overviewQuery, scopeFromUrl, writeScope, scopeError } from "../src/lib/overview-scope";

test("概览使用固定业务时钟的规定窗口，URL恢复筛选并核查授权字典", () => {
  const url = new URL("http://localhost/?days=30&metric=refund_amount&sku=A&sku=B&region=east");
  const scope = scopeFromUrl(url);
  assert.deepEqual(scope, { days: 30, metricId: "refund_amount", filters: { regionId: ["east"], skuId: ["A", "B"] } });
  for (const [days, current, start, end] of [[1, "2026-10-21", "2026-10-14", "2026-10-15"], [7, "2026-10-15", "2026-10-08", "2026-10-15"], [30, "2026-09-22", "2026-08-23", "2026-09-22"]] as const) {
    const query = overviewQuery("2026-10-22", { ...scope, days });
    assert.deepEqual(query.currentWindow, { startDate: current, endDateExclusive: "2026-10-22" });
    assert.deepEqual(query.baselineWindow, { startDate: start, endDateExclusive: end });
  }
  const restored = new URL("http://localhost/?report=original");
  writeScope(restored, scope);
  assert.deepEqual(scopeFromUrl(restored), scope);
  assert.equal(restored.searchParams.get("report"), "original");
  const profile = profileExample as DatasetProfile;
  assert.equal(scopeError({ ...scope, filters: { skuId: [profile.filters.skuId[0]!.value] } }, profile), null);
  assert.match(scopeError({ ...scope, filters: { skuId: ["not-authorized"] } }, profile)!, /授权字典/);
});

test("overview adapter只POST原QuerySpec，拒绝错范围、错单位和不安全数值，保留analysisQuery", async (t) => {
  const example = structuredClone(overviewExample) as { request: Overview["query"]; response: Overview };
  let value = structuredClone(example.response);
  t.mock.method(globalThis, "fetch", async (path: string, init?: RequestInit) => {
    assert.equal(path, `/api/datasets/${example.response.dataset.version}/overview`);
    assert.equal(init!.method, "POST");
    assert.deepEqual(JSON.parse(init!.body as string), example.request);
    return new Response(JSON.stringify(value));
  });
  const api = createApi();
  const result = await api.overview(example.response.dataset.version, example.request);
  assert.deepEqual(result.trend.points[0]!.analysisQuery, example.response.trend.points[0]!.analysisQuery);
  for (const mutate of [
    (r: Overview) => { r.dataset.version = "foreign"; },
    (r: Overview) => { r.query.filters = { skuId: ["foreign"] }; },
    (r: Overview) => { r.metrics[0]!.comparison.current = Number.MAX_SAFE_INTEGER + 1; },
    (r: Overview) => { r.metrics[0]!.unit = "units"; },
    (r: Overview) => { r.changes.push(...Array.from({ length: 6 }, () => r.changes[0]!)); },
  ]) {
    value = structuredClone(example.response); mutate(value);
    await assert.rejects(api.overview(example.response.dataset.version, example.request));
  }
});

test("默认恢复概览，原报告和run链接优先恢复分析", () => {
  const url = (query: string) => new URL(`http://localhost/${query}`);
  assert.equal(pageFromUrl(url("")), "overview");
  assert.equal(pageFromUrl(url("?page=profile&dataset=other")), "profile");
  assert.equal(pageFromUrl(url("?page=overview&report=saved")), "workspace");
  assert.equal(pageFromUrl(url("?page=profile&run=active")), "workspace");
  assert.equal(pageFromUrl(url("?page=unknown")), "overview");
});

test("显式创建指定版本会话无需读取默认目录，且拒绝版本错配", async (t) => {
  const bodies: unknown[] = [];
  let responseVersion = "selected-version";
  t.mock.method(globalThis, "fetch", async (path: string, init?: RequestInit) => {
    assert.equal(path, "/api/sessions");
    bodies.push(JSON.parse(init!.body as string));
    return new Response(JSON.stringify({ sessionId: "new-session", datasetVersion: responseVersion }), { status: 201 });
  });
  const api = createApi();
  assert.equal(await api.createSession("selected-version"), "new-session");
  assert.deepEqual(bodies, [{ datasetVersion: "selected-version" }]);
  responseVersion = "wrong-version";
  await assert.rejects(api.createSession("selected-version"), /版本与请求不一致/);
});

test("概况adapter使用授权版本路径，拒绝版本错配、非安全数量和契约外响应", async (t) => {
  let body: unknown = profileExample;
  t.mock.method(globalThis, "fetch", async (path: string) => {
    assert.equal(path, "/api/datasets/portfolio-90d-v1/profile");
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const api = createApi();
  assert.deepEqual(await api.profile("portfolio-90d-v1"), profileExample);
  body = { ...profileExample, dataset: { ...profileExample.dataset, version: "other" } };
  await assert.rejects(api.profile("portfolio-90d-v1"), /版本与请求不一致/);
  body = { ...profileExample, counts: { ...profileExample.counts, orders: Number.MAX_SAFE_INTEGER + 1 } };
  await assert.rejects(api.profile("portfolio-90d-v1"), /共享 HTTP 契约/);
  body = { ...profileExample, unexpected: "field" };
  await assert.rejects(api.profile("portfolio-90d-v1"), /共享 HTTP 契约/);
});

test("HTTP支付样例保留手工预期、负贡献和超过100%的份额", () => {
  const report = validateReport(flow.report);
  assert.deepEqual(report.comparison, { current: 7000000, baseline: 10000000, delta: -3000000, changeRate: -0.3 });
  assert.deepEqual(report.contributors.map((c) => c.delta), [-4000000, 1000000]);
  assert.equal(rate(report.contributors[0]!.share), "133.3%");
  assert.equal(rate(report.contributors[1]!.share), "−33.3%");
  assert.equal(evidenceCell(7000000, "本期（分）"), "¥70,000.00");
});
test("拒绝不安全整数、篡改总量、贡献不守恒及悬空引用", () => {
  for (const mutate of [
    (r: Report) => { r.comparison.current = Number.MAX_SAFE_INTEGER + 1; },
    (r: Report) => { r.comparison.delta = -1; },
    (r: Report) => { r.contributors[0]!.delta = -2; },
    (r: Report) => { r.hypotheses = [{ text: "无效引用", evidenceIds: ["missing"], missingEvidence: [] }]; },
  ]) {
    const report = structuredClone(flow.report) as Report;
    mutate(report);
    assert.throws(() => validateReport(report));
  }
});
test("件数与旧来源版本可读；指标单位错配拒绝", () => {
  const report = structuredClone(flow.report) as Report;
  report.provenance.contractVersion = "1.0.0";
  assert.equal(validateReport(report).unit, "fen");
  report.query.metricId = "sold_units";
  report.unit = "units";
  assert.equal(validateReport(report).unit, "units");
  report.unit = "fen";
  assert.throws(() => validateReport(report));
});
test("null、真实零、负金额及件数分别展示", () => {
  assert.equal(money(null), "—");
  assert.equal(metricValue(0, "fen"), "¥0.00");
  assert.equal(metricValue(-3000000, "fen", true), "−¥30,000.00");
  assert.equal(metricValue(70, "units"), "70 件");
  assert.equal(rate(null), "不可计算");
  assert.equal(evidenceCell(null, "覆盖率"), "缺失");
});
test("澄清日期来自业务时钟，跨月/闰年仍只取完整日", () => {
  assert.deepEqual(clarificationQuery("2026-10-22", "paid_amount", "east"), flow.report.query);
  const query = clarificationQuery("2024-03-01", "refund_amount", "");
  assert.deepEqual(query.currentWindow, { startDate: "2024-02-29", endDateExclusive: "2024-03-01" });
  assert.deepEqual(query.baselineWindow, { startDate: "2024-02-22", endDateExclusive: "2024-02-23" });
  assert.deepEqual(query.filters, {});
});
test("SSE按run隔离且阶段映射不使用0—7直接索引", () => {
  assert.equal(parseEvent(JSON.stringify(flow.events[0]), "foreign"), null);
  assert.equal(parseEvent(JSON.stringify(flow.events[0]), "example-run")?.seq, 1);
  assert.equal(phaseIndex("persisting"), 3);
  assert.equal(phaseIndex("comparing"), 1);
});
test("产品源码没有模拟数据、报告本地缓存或MockApi入口", () => {
  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
      ? sources(join(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []);
  }
  for (const file of sources(fileURLToPath(new URL("../src", import.meta.url)))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /MockApi|web-demo-v1|demo-main|demoCatalog|queryForQuestion|makeReport|localStorage|sessionStorage|\.\/fixtures/);
  }
});
