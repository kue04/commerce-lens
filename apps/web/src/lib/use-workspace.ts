import { useCallback, useEffect, useRef, useState } from "react";
import { createApi } from "./api";
import type {
  Catalog,
  HistoryItem,
  QuerySpec,
  Report,
  Run,
} from "./types";

function locate(kind: "report" | "run", id: string) {
  const url = new URL(location.href);
  url.searchParams.delete(kind === "report" ? "run" : "report");
  url.searchParams.set(kind, id);
  window.history.replaceState(null, "", url);
}

export function useWorkspace() {
  const api = useRef(createApi());
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    connected: boolean;
    message?: string;
  }>({ connected: true });
  const [exporting, setExporting] = useState(false);
  const stop = useRef<() => void>(() => undefined);
  const generation = useRef(0);
  const seq = useRef(0);
  const submitLock = useRef(false);
  const exportGeneration = useRef<number | null>(null);
  const session = useRef<string | null>(null);
  const currentQuery = useRef<QuerySpec | null>(null);
  const runRef = useRef<Run | null>(null);
  const busy = loading || ["queued", "running"].includes(run?.status ?? "");
  function navigationLocked() {
    return submitLock.current || ["queued", "running"].includes(runRef.current?.status ?? "");
  }
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  const refreshHistory = async () => {
    const gen = generation.current;
    const items = await api.current.history();
    if (gen === generation.current) setHistory(items);
  };
  const openReport = useCallback(async (id: string) => {
    if (navigationLocked()) return;
    const gen = ++generation.current;
    stop.current();
    exportGeneration.current = null;
    setExporting(false);
    submitLock.current = false;
    setLoading(true);
    setError(null);
    setRun(null);
    runRef.current = null;
    setReport(null);
    setConnection({ connected: true });
    try {
      const r = await api.current.report(id);
      if (gen !== generation.current) return;
      setReport(r);
      session.current = r.sessionId;
      currentQuery.current = r.query;
      locate("report", r.id);
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, []);

  const openRun = useCallback(async (id: string) => {
    if (navigationLocked()) return;
    const gen = ++generation.current;
    stop.current();
    exportGeneration.current = null;
    setExporting(false);
    setLoading(true);
    setError(null);
    setReport(null);
    setRun(null);
    runRef.current = null;
    setConnection({ connected: true });
    try {
      const restored = await api.current.run(id);
      if (gen !== generation.current) return;
      session.current = restored.sessionId;
      // QuerySpec and follow-up context are restored from server-owned runs/reports.
      currentQuery.current = null;
      updateRun(restored);
      seq.current = 0;
      submitLock.current = ["queued", "running"].includes(restored.status);
      if (submitLock.current) subscribe(restored, gen);
      else await acceptRun(restored, gen);
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.current = createApi();
    const client = api.current;
    setCatalog(null);
    setHistory([]);
    setError(null);
    setReport(null);
    setRun(null);
    runRef.current = null;
    session.current = null;
    currentQuery.current = null;
    const gen = ++generation.current;
    stop.current();
    exportGeneration.current = null;
    setExporting(false);
    submitLock.current = false;
    void (async () => {
      setLoading(true);
      try {
        const c = await client.catalog();
        if (!active || gen !== generation.current) return;
        setCatalog(c);
        const h = await client.history();
        if (!active || gen !== generation.current) return;
        setHistory(h);
        const params = new URL(location.href).searchParams;
        const runId = params.get("run");
        if (runId) {
          await openRun(runId);
          return;
        }
        const reportId = params.get("report");
        if (reportId) await openReport(reportId);
      } catch (e) {
        if (active && gen === generation.current)
          setError((e as Error).message);
      } finally {
        if (active && gen === generation.current) setLoading(false);
      }
    })();
    return () => {
      active = false;
      ++generation.current;
      stop.current();
      exportGeneration.current = null;
    };
  }, [reloadKey, openReport, openRun]);

  useEffect(() => {
    const restore = () => {
      const current = runRef.current;
      if (navigationLocked()) {
        // browser back/forward 与按钮遵守同一个运行锁，不能丢掉活动订阅。
        if (current) locate("run", current.id);
        return;
      }
      const params = new URL(location.href).searchParams;
      const runId = params.get("run");
      const reportId = params.get("report");
      if (runId) void openRun(runId);
      else if (reportId) void openReport(reportId);
      else fresh();
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [openReport, openRun]);

  function subscribe(activeRun: Run, gen: number) {
    stop.current();
    stop.current = api.current.subscribe(
      activeRun.id,
      seq.current,
      (event) => {
        if (
          gen !== generation.current ||
          event.runId !== activeRun.id ||
          event.seq <= seq.current
        )
          return;
        seq.current = event.seq;
        const current = runRef.current;
        if (!current || current.id !== activeRun.id) return;
        // 终态不可被迟到的阶段或报告通知反转。
        if (!["queued", "running"].includes(current.status)) return;
        if (event.type === "run.started")
          updateRun({ ...current, status: "running" });
        if (event.type === "phase.changed")
          updateRun({
            ...current, status: "running", phase: event.payload.phase,
            phaseName: event.payload.phaseName,
          });
        if (event.type === "clarification.required") {
          updateRun({
            ...current, status: "needs_clarification",
            clarification: event.payload.clarification,
          });
          submitLock.current = false;
        }
        if (event.type === "report.ready" && event.payload.reportId) {
          // ready 仅提供引用，run.finished 才确认是否应显示成功报告。
          updateRun({ ...current, reportId: event.payload.reportId });
        }
        if (event.type === "run.finished") {
          acceptRun({
            ...current, status: event.payload.status,
            message: event.payload.message,
          }, gen);
        }
      },
      (connected, message) => {
        if (gen === generation.current) setConnection({ connected, message });
      },
      (snapshot) => {
        if (gen !== generation.current || snapshot.id !== activeRun.id) return;
        acceptRun(snapshot, gen);
      },
    );
  }

  function updateRun(current: Run) {
    runRef.current = current;
    setRun(current);
  }
  function acceptRun(current: Run, gen: number) {
    const previous = runRef.current;
    if (gen !== generation.current || previous?.id !== current.id) return;
    if (!["queued", "running"].includes(previous.status) && previous.status !== current.status)
      return;
    updateRun(current);
    submitLock.current = ["queued", "running"].includes(current.status);
    if (submitLock.current) return;
    setConnection({ connected: true });
    if (!current.reportId || !["completed", "partial"].includes(current.status)) {
      setReport(null);
      if (["completed", "partial"].includes(current.status))
        setError("服务端任务记录不完整：已完成任务缺少报告引用，请新建分析。未显示其他报告。");
      setLoading(false);
      return;
    }
    setLoading(true);
    return api.current.report(current.reportId).then((result) => {
      if (result.runId !== current.id || result.sessionId !== current.sessionId || result.status !== current.status)
        throw new Error("服务端任务记录不完整：报告与当前任务不匹配，已阻止展示。请新建分析。");
      if (gen !== generation.current ||
        runRef.current?.id !== current.id || runRef.current.status !== current.status) return;
      setReport(result);
      currentQuery.current = result.query;
      locate("report", result.id);
      void refreshHistory().catch(() => undefined);
    }).catch((e) => {
      if (gen === generation.current) setError((e as Error).message);
    }).finally(() => {
      if (gen === generation.current) setLoading(false);
    });
  }

  async function submit(question: string, confirmedIntent?: QuerySpec) {
    if (!question.trim() || submitLock.current || loading || !catalog) return false;
    submitLock.current = true;
    setError(null);
    setReport(null);
    setConnection({ connected: true });
    const gen = ++generation.current;
    stop.current();
    exportGeneration.current = null;
    setExporting(false);
    seq.current = 0;
    setLoading(true);
    const parentRunId = runRef.current?.id ?? report?.runId;
    try {
      const id = session.current ?? (await api.current.createSession(catalog.version));
      if (gen !== generation.current) return false;
      session.current = id;
      const query = confirmedIntent;
      const result = await api.current.start(id, {
        question: question.trim(),
        parentRunId,
        confirmedIntent: query,
      });
      if (gen !== generation.current) return false;
      if (query) currentQuery.current = query;
      locate("run", result.id);
      updateRun(result);
      if (["queued", "running"].includes(result.status)) subscribe(result, gen);
      else await acceptRun(result, gen);
      return true;
    } catch (e) {
      if (gen === generation.current) {
        setError((e as Error).message);
        setRun(null);
        submitLock.current = false;
      }
      return false;
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }

  async function cancel() {
    const active = runRef.current;
    if (!active) return;
    const gen = generation.current;
    try {
      const result = await api.current.cancel(active.id);
      if (gen !== generation.current) return;
      acceptRun(result, gen);
      if (!["queued", "running"].includes(result.status)) stop.current();
    } catch (e) {
      if (gen === generation.current)
        setError(`取消请求未确认：${(e as Error).message}。任务可能仍在运行。`);
    }
  }
  function fresh() {
    if (navigationLocked()) return false;
    ++generation.current;
    stop.current();
    exportGeneration.current = null;
    setExporting(false);
    submitLock.current = false;
    setReport(null);
    setRun(null);
    runRef.current = null;
    setError(null);
    setLoading(false);
    setConnection({ connected: true });
    session.current = null;
    currentQuery.current = null;
    const url = new URL(location.href);
    url.searchParams.delete("report");
    url.searchParams.delete("run");
    window.history.replaceState(null, "", url);
    return true;
  }
  async function reconnect() {
    const active = runRef.current;
    if (!active) return;
    const gen = generation.current;
    try {
      const current = await api.current.run(active.id);
      if (gen !== generation.current) return;
      await acceptRun(current, gen);
      if (gen !== generation.current) return;
      const accepted = runRef.current;
      if (!accepted || accepted.id !== active.id) return;
      if (["queued", "running"].includes(accepted.status))
        subscribe(accepted, gen);
      else
        setConnection({ connected: true, message: "已恢复任务的最终状态。" });
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    }
  }
  async function download(format: "md" | "json") {
    if (!report || exportGeneration.current !== null) return;
    const gen = generation.current;
    exportGeneration.current = gen;
    setExporting(true);
    try {
      const blob = await api.current.export(report.id, format);
      if (gen !== generation.current) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Commerce-Lens-${report.query.currentWindow.startDate}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      if (gen === generation.current && exportGeneration.current === gen) {
        exportGeneration.current = null;
        setExporting(false);
      }
    }
  }
  return {
    reload: () => setReloadKey((key) => key + 1),
    api: api.current,
    catalog,
    report,
    run,
    history,
    error,
    setError,
    loading,
    busy,
    connection,
    exporting,
    query: report?.query ?? currentQuery.current,
    openReport,
    submit,
    cancel,
    fresh,
    reconnect,
    download,
  };
}
