import { Value } from "typebox/value";
import type { TSchema } from "typebox";
import {
  CONTRACT_VERSION,
  CatalogSchema,
  DatasetProfileSchema,
  OverviewRequestSchema,
  OverviewSchema,
  EvidenceSchema,
  ErrorSchema,
  HistorySchema,
  ReportSchema,
  RunSchema,
  RunEventSchema,
  SessionResponseSchema,
  StartRunResponseSchema,
} from "../../../../packages/contracts/src/http";
import type {
  AnalysisApi,
  Catalog,
  DatasetProfile,
  Overview,
  QuerySpec,
  Evidence,
  HistoryItem,
  Report,
  Run,
  RunEvent,
  StartInput,
} from "./types";
export class ApiError extends Error {
  constructor(
    message: string,
    public code = "REQUEST_FAILED",
    public retryable = true,
  ) {
    super(message);
  }
}

export function validateReport(value: unknown): Report {
  if (!Value.Check(ReportSchema, value))
    throw new ApiError(
      `报告不符合共享 ReportSchema v${CONTRACT_VERSION}`,
      "INVALID_RESPONSE",
      false,
    );
  const r = value as Report;
  if (
    typeof r.id !== "string" ||
    typeof r.runId !== "string" ||
    typeof r.sessionId !== "string" ||
    typeof r.question !== "string" ||
    typeof r.title !== "string" ||
    !["completed", "partial"].includes(r.status) ||
    !r.query?.currentWindow ||
    !r.query?.baselineWindow ||
    !r.query?.filters ||
    !r.dataset?.version ||
    r.unit !== (r.query.metricId === "sold_units" ? "units" : "fen") ||
    !r.comparison ||
    !Array.isArray(r.contributors) ||
    !Array.isArray(r.evidences) ||
    ![
      "facts",
      "hypotheses",
      "unknowns",
      "nextActions",
      "limitations",
      "trace",
    ].every((key) => Array.isArray(r[key as keyof Report]))
  ) {
    throw new ApiError(
      "报告字段与共享契约不兼容，已阻止展示",
      "INVALID_RESPONSE",
      false,
    );
  }
  const comparisons = [r.comparison, ...r.contributors];
  for (const c of comparisons) {
    for (const key of ["current", "baseline", "delta"] as const) {
      if (c[key] !== null && !Number.isSafeInteger(c[key]))
        throw new ApiError(
          "报告包含不安全的金额或数量",
          "INVALID_RESPONSE",
          false,
        );
    }
    if (c.changeRate !== null && !Number.isFinite(c.changeRate))
      throw new ApiError("变化率无效", "INVALID_RESPONSE");
  }
  if (
    r.comparison.current !== null &&
    r.comparison.baseline !== null &&
    r.comparison.delta !== r.comparison.current - r.comparison.baseline
  )
    throw new ApiError("报告变化额不守恒", "INVALID_RESPONSE");
  if (
    r.contributors.length &&
    r.comparison.delta !== null &&
    r.contributors.reduce((sum, c) => sum + (c.delta ?? 0), 0) !==
      r.comparison.delta
  )
    throw new ApiError("贡献与总变化不一致", "INVALID_RESPONSE");
  for (const e of r.evidences)
    if (
      !e.id ||
      !e.query ||
      !Array.isArray(e.rows) ||
      !Array.isArray(e.columns)
    )
      throw new ApiError("证据结构无效", "INVALID_RESPONSE");
  for (const f of [...r.facts, ...r.hypotheses])
    if (
      typeof f.text !== "string" ||
      !Array.isArray(f.evidenceIds) ||
      f.evidenceIds.some((id) => !r.evidences.some((e) => e.id === id))
    )
      throw new ApiError("报告存在无效证据引用", "INVALID_RESPONSE");
  return r;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      "无法连接本地 API。请确认 127.0.0.1:3000 已启动后重试。",
      "NETWORK_ERROR",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body as {
      message?: string;
      code?: string;
      retryable?: boolean;
    } | null;
    throw new ApiError(
      error?.message ?? `接口返回 HTTP ${response.status}`,
      error?.code,
      error?.retryable,
    );
  }
  if (body === null)
    throw new ApiError("接口未返回有效 JSON", "INVALID_RESPONSE");
  return body as T;
}

export function parseEvent(
  raw: string,
  expectedRunId: string,
): RunEvent | null {
  const e = JSON.parse(raw) as RunEvent;
  if (e.runId !== expectedRunId) return null;
  if (!Value.Check(RunEventSchema, e))
    throw new ApiError("事件格式不符合共享 RunEventSchema", "INVALID_EVENT");
  return e;
}

class HttpApi implements AnalysisApi {
  async catalog() {
    return checked<Catalog>(await request("/catalog"), CatalogSchema);
  }
  async profile(datasetVersion: string, signal?: AbortSignal) {
    const result = checked<DatasetProfile>(
      await request(`/datasets/${encodeURIComponent(datasetVersion)}/profile`, { signal }),
      DatasetProfileSchema,
    );
    if (result.dataset.version !== datasetVersion)
      throw new ApiError("数据概况版本与请求不一致", "INVALID_RESPONSE", false);
    return result;
  }
  async history() {
    return checked<HistoryItem[]>(
      await request("/sessions?limit=30"),
      HistorySchema,
    );
  }
  async overview(datasetVersion: string, query: QuerySpec, signal?: AbortSignal) {
    if (!Value.Check(OverviewRequestSchema, query))
      throw new ApiError("概览请求不符合共享 QuerySpec", "INVALID_REQUEST", false);
    const result = checked<Overview>(await request(`/datasets/${encodeURIComponent(datasetVersion)}/overview`, {
      method: "POST", body: JSON.stringify(query), signal,
    }), OverviewSchema);
    // Validate request identity as well as shape before displaying business data.
    const identity = (value: QuerySpec) => JSON.stringify([value.metricId,
      value.currentWindow.startDate, value.currentWindow.endDateExclusive,
      value.baselineWindow.startDate, value.baselineWindow.endDateExclusive,
      ...(["channelId", "regionId", "skuId"] as const).map((key) => [...(value.filters[key] ?? [])].sort()), value.groupBy, value.topN ?? 10]);
    if (result.dataset.version !== datasetVersion || identity(result.query) !== identity(query) ||
      result.trend.metricId !== query.metricId || new Set(result.metrics.map((metric) => metric.metricId)).size !== 3 ||
      result.metrics.some((metric) => metric.unit !== (metric.metricId === "sold_units" ? "units" : "fen")))
      throw new ApiError("概览范围与请求不一致", "INVALID_RESPONSE", false);
    return result;
  }
  async createSession(datasetVersion?: string) {
    const version = datasetVersion ?? (await this.catalog()).version;
    const result = checked<{ sessionId: string; datasetVersion: string }>(
      await request("/sessions", {
        method: "POST",
        body: JSON.stringify({ datasetVersion: version }),
      }),
      SessionResponseSchema,
    );
    if (result.datasetVersion !== version)
      throw new ApiError("会话数据版本与请求不一致", "INVALID_RESPONSE", false);
    return result.sessionId;
  }
  async start(session: string, input: StartInput): Promise<Run> {
    const result = checked<{ runId: string; status: Run["status"] }>(
      await request(`/sessions/${encodeURIComponent(session)}/runs`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          question: input.question,
          parentRunId: input.parentRunId,
          confirmedIntent: input.confirmedIntent,
        }),
      }),
      StartRunResponseSchema,
    );
    if (!result.runId)
      throw new ApiError("创建任务响应缺少 runId", "INVALID_RESPONSE");
    return this.run(result.runId);
  }
  async run(id: string) {
    return checked<Run>(
      await request(`/runs/${encodeURIComponent(id)}`),
      RunSchema,
    );
  }
  async report(id: string) {
    return validateReport(
      await request<unknown>(`/reports/${encodeURIComponent(id)}`),
    );
  }
  async evidence(id: string) {
    return checked<Evidence>(
      await request(`/evidences/${encodeURIComponent(id)}`),
      EvidenceSchema,
    );
  }
  async cancel(id: string) {
    return checked<Run>(
      await request(`/runs/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: "{}",
      }),
      RunSchema,
    );
  }
  async export(id: string, format: "md" | "json") {
    const r = await fetch(
      `/api/reports/${encodeURIComponent(id)}/export?format=${format}`,
    );
    if (!r.ok) throw new ApiError(`导出失败 HTTP ${r.status}`);
    return r.blob();
  }
  subscribe(
    id: string,
    after: number,
    onEvent: (e: RunEvent) => void,
    connection: (c: boolean, m?: string) => void,
    snapshot: (run: Run) => void,
  ) {
    const controller = new AbortController();
    let last = after;
    const stream = async () => {
      let attempts = 0;
      while (!controller.signal.aborted && attempts < 4) {
        try {
          const response = await fetch(
            `/api/runs/${encodeURIComponent(id)}/events`,
            {
              signal: controller.signal,
              headers: {
                Accept: "text/event-stream",
                "Last-Event-ID": String(last),
              },
            },
          );
          if (controller.signal.aborted) {
            await response.body?.cancel().catch(() => undefined);
            return;
          }
          if (response.status === 410) {
            const error = checked<{ code: string; details?: { reportUrl?: string } }>(
              await response.json(), ErrorSchema,
            );
            if (controller.signal.aborted) return;
            if (error.code !== "REPLAY_EXPIRED") throw new Error(error.code);
            const current = await this.run(id);
            if (controller.signal.aborted) return;
            if (!["queued", "running"].includes(current.status)) {
              if (!current.reportId && error.details?.reportUrl &&
                ["completed", "partial"].includes(current.status)) {
                const match = /^\/api\/reports\/([^/?#]+)$/.exec(error.details.reportUrl);
                if (!match) throw new Error("报告恢复地址无效");
                const report = await this.report(decodeURIComponent(match[1]!));
                if (controller.signal.aborted) return;
                if (report.runId !== id || report.sessionId !== current.sessionId || report.status !== current.status)
                  throw new Error("恢复报告与任务不匹配");
                current.reportId = report.id;
              }
              snapshot(current);
              return;
            }
            throw new Error("事件已过期，任务尚未完成");
          }
          if (!response.ok || !response.body)
            throw new Error(`HTTP ${response.status}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          connection(true, attempts ? "事件连接已恢复。" : undefined);
          try {
            while (!controller.signal.aborted) {
              const { done, value } = await reader.read();
              if (controller.signal.aborted) return;
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              buffer = buffer.replaceAll("\r\n", "\n");
              if (buffer.length > 1_000_000) throw new Error("事件大小超限");
              let boundary: number;
              while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                if (controller.signal.aborted) return;
                const block = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const data = block
                  .split("\n")
                  .filter((s) => s.startsWith("data:"))
                  .map((s) => s.slice(5).trimStart())
                  .join("\n");
                if (!data) continue;
                const event = parseEvent(data, id);
                if (!event || event.seq <= last) continue;
                last = event.seq;
                onEvent(event);
                if (
                  ["run.finished", "clarification.required"].includes(
                    event.type,
                  )
                )
                  return;
              }
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          // EOF 仅表示订阅关闭，必须查询权威终态，不能将其判为成功。
          if (controller.signal.aborted) return;
          const current = await this.run(id);
          if (controller.signal.aborted) return;
          if (!["running", "queued"].includes(current.status)) {
            snapshot(current);
            return;
          }
          throw new Error("事件连接提前关闭");
        } catch {
          if (controller.signal.aborted) return;
          attempts++;
          connection(
            false,
            attempts < 4
              ? "连接中断，正在从最后事件序号恢复。任务未取消。"
              : "多次重连失败。请点击“恢复连接”查询任务；任务未取消。",
          );
          if (attempts < 4)
            await new Promise<void>((resolve) => {
              const timer = setTimeout(
                resolve,
                Math.min(1000 * 2 ** attempts, 8000),
              );
              controller.signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
            });
        }
      }
    };
    void stream();
    return () => controller.abort();
  }
}
export function createApi(): AnalysisApi {
  return new HttpApi();
}

function checked<T>(value: unknown, schema: TSchema): T {
  if (!Value.Check(schema, value))
    throw new ApiError(
      `接口数据不符合共享 HTTP 契约 v${CONTRACT_VERSION}`,
      "INVALID_RESPONSE",
      false,
    );
  return value as T;
}
