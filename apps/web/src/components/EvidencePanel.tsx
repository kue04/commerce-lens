import { useEffect, useRef, useState } from "react";
import { Dialog, Tabs } from "radix-ui";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Info,
  LoaderCircle,
  X,
} from "lucide-react";
import { Button } from "./ui";
import type { AnalysisApi, Evidence, Report } from "../lib/types";
import { rate } from "../lib/format";
import { evidenceCell } from "../lib/selectors";

export function EvidencePanel({
  id,
  report,
  api,
  onClose,
  returnFocus,
  onSelect,
}: {
  id: string | null;
  report: Report | null;
  api: AnalysisApi;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState("detail");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(
    () => window.matchMedia("(max-width: 1279px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const update = () => setOverlay(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let active = true;
    setEvidence(null);
    setError(null);
    setTab("detail");
    if (id)
      void api
        .evidence(id)
        .then((e) => {
          if (active) setEvidence(e);
        })
        .catch((e) => {
          if (active) setError((e as Error).message);
        });
    return () => {
      active = false;
    };
  }, [id, api]);
  const e = evidence;
  const inventory = e?.status === "success" && e.signal?.type === "inventory" ? e.signal : null;
  const columns = e?.columns ?? [];
  const rows = e?.rows ?? [];
  return (
    <Dialog.Root
      open={Boolean(id)}
      modal={overlay}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        {overlay && <Dialog.Overlay className="evidence-overlay" />}
        <Dialog.Content
          ref={panel}
          className="evidence-panel"
          aria-describedby="evidence-description"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            panel.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          onInteractOutside={(event) => {
            if (!overlay) event.preventDefault();
          }}
        >
          <div className="panel-top">
            <Dialog.Title>证据详情</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="icon-button"
                aria-label="关闭证据面板"
              >
                <X size={21} strokeWidth={1.5} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="evidence-description" className="sr-only">
            查看查询结果、执行记录和分析口径。按 Escape 关闭。
          </Dialog.Description>
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List className="panel-tabs" aria-label="证据内容">
              <Tabs.Trigger value="detail">证据详情</Tabs.Trigger>
              <Tabs.Trigger value="trace">执行记录</Tabs.Trigger>
              <Tabs.Trigger value="scope">分析口径</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="detail" className="panel-content">
              {error ? (
                <div className="inline-alert error" role="alert">
                  <CircleAlert size={18} />
                  {error}
                </div>
              ) : !e ? (
                <div className="panel-loading" role="status">
                  <LoaderCircle className="spin" size={22} />
                  加载证据…
                </div>
              ) : (
                <>
                  {report && report.evidences.length > 1 ? (
                    <label className="evidence-picker">
                      <span className="sr-only">切换证据</span>
                      <select
                        aria-label="切换证据"
                        value={e.id}
                        onChange={(event) => onSelect(event.target.value)}
                      >
                        {report.evidences.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.title}
                            {item.status === "missing" ? " · 数据缺失" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="evidence-code">{e.code}</span>
                  )}
                  <h2 className="evidence-title">{e.title}</h2>
                  <div
                    className={`query-status ${e.status === "missing" ? "warning-text" : ""}`}
                  >
                    {e.status === "success" ? (
                      <>
                        <span className="status-dot" />
                        查询成功
                      </>
                    ) : (
                      <>
                        <CircleAlert size={15} />
                        数据缺失
                      </>
                    )}
                  </div>
                  <dl className="evidence-meta">
                    <dt>地区</dt>
                    <dd>
                      {e.query.filters.regionId
                        ?.map((id) => (id === "east" ? "华东" : id))
                        .join("、") ?? "全部地区"}
                    </dd>
                    <dt>日期</dt>
                    <dd>{e.query.currentWindow.startDate} 至 {e.query.currentWindow.endDateExclusive}（不含）</dd>
                    <dt>比较日期</dt>
                    <dd>{e.query.baselineWindow.startDate} 至 {e.query.baselineWindow.endDateExclusive}（不含）</dd>
                    <dt>商品</dt>
                    <dd>{e.query.filters.skuId?.join("、") ?? "全部商品"}</dd>
                    <dt>渠道</dt>
                    <dd>{e.query.filters.channelId?.join("、") ?? "全渠道"}</dd>
                    <dt>观测覆盖</dt>
                    <dd>
                      {e.coverage === null
                        ? "缺失 / 无法核查"
                        : inventory
                          ? `${inventory.current.observedHours} / ${inventory.current.expectedHours} 池小时`
                            : rate(e.coverage)}
                    </dd>
                  </dl>
                  {e.kind === "inventory" && (
                    <section className="inventory-section">
                      <div className="stock-number">
                        {inventory ? inventory.current.zeroHours : "—"}
                        <span>{inventory ? "池小时" : "小时"}</span>
                      </div>
                      <p className="muted">{inventory ? "本期零库存观测 · SKU × 大区共享池" : "当日零库存时长"}</p>
                      {inventory ? (
                        <p className="muted">
                          基期覆盖 {inventory.baseline.observedHours} / {inventory.baseline.expectedHours} 池小时，零库存 {inventory.baseline.zeroHours} 池小时。
                          聚合观测不能推导具体缺货时段，也不代表渠道独享库存。
                        </p>
                      ) : (
                        <div className="missing-chart">
                          <CircleAlert size={22} />
                          <span>无库存观测，不能当作零库存</span>
                        </div>
                      )}
                    </section>
                  )}
                  <div className="table-scroll">
                    <table className="data-table evidence-table">
                      <thead>
                        <tr>
                          {columns.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length ? (
                          rows.map((row, index) => (
                            <tr key={index}>
                              {row.map((v, i) => (
                                <td key={i}>
                                  {evidenceCell(v, columns[i] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={columns.length}>范围内无数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="evidence-note">
                    <Info size={18} />
                    <span>{e.note}</span>
                  </div>
                  <dl className="source-meta">
                    <dt>来源</dt>
                    <dd>{e.source}</dd>
                    <dt>数据版本</dt>
                    <dd>{e.datasetVersion}</dd>
                    <dt>指标版本</dt>
                    <dd>{e.metricVersion}</dd>
                  </dl>
                  <details className="query-details">
                    <summary>
                      查看查询条件
                      <ChevronRight size={17} />
                    </summary>
                    <pre>{JSON.stringify(e.query, null, 2)}</pre>
                    <p>窗口采用左闭右开，时区 Asia/Shanghai。</p>
                  </details>
                  {e.signal && (
                    <details className="query-details">
                      <summary>查看结构化信号</summary>
                      <pre>{JSON.stringify(e.signal, null, 2)}</pre>
                    </details>
                  )}
                </>
              )}
            </Tabs.Content>
            <Tabs.Content value="trace" className="panel-content">
              <span className="eyebrow">EXECUTION LOG</span>
              <h2 className="evidence-title">可核验的执行记录</h2>
              <p className="muted">
                仅展示服务端返回的公开工具动作与参数摘要。
              </p>
              <ol className="trace-list">
                {report?.trace.map((item, i) => (
                  <li key={i}>
                    <span className={`trace-icon ${item.status}`}>
                      <Check size={14} />
                    </span>
                    <div>
                      <code>{item.name}</code>
                      <p>{item.params}</p>
                      <span className="muted">
                        {item.status === "success" ? "已完成" : "缺少数据"} ·{" "}
                        {item.durationMs} ms
                      </span>
                      {item.evidenceId &&
                        report?.evidences.some(
                          (e) => e.id === item.evidenceId,
                        ) && (
                          <button
                            className="trace-evidence"
                            onClick={() => {
                              onSelect(item.evidenceId!);
                              setTab("detail");
                            }}
                          >
                            查看对应证据
                            <ChevronRight size={12} />
                          </button>
                        )}
                    </div>
                  </li>
                ))}
              </ol>
            </Tabs.Content>
            <Tabs.Content value="scope" className="panel-content">
              <span className="eyebrow">METRIC DEFINITION</span>
              <h2 className="evidence-title">{report?.metricLabel}口径</h2>
              <dl className="definition-list">
                <dt>支付金额</dt>
                <dd>
                  按支付成功时间归属，汇总订单行支付金额；金额以整数分计算。
                </dd>
                <dt>退款金额</dt>
                <dd>按退款成功时间归属，与支付分别聚合，不回写原支付日期。</dd>
                <dt>销售件数</dt>
                <dd>支付成功订单行件数之和，不等同于订单数。</dd>
                <dt>变化率</dt>
                <dd>
                  （本期 − 基期）÷ 基期。基期为零时不可计算，显示“不可计算”。
                </dd>
                <dt>贡献份额</dt>
                <dd>
                  分组变化 ÷
                  总变化。总变化为零时不可计算。增长抵消下降时份额可为负或超过
                  100%。
                </dd>
                <dt>当前覆盖</dt>
                <dd>
                  {rate(e?.coverage ?? null)}；缺失观测与真实零值分别展示。
                </dd>
                <dt>分析边界</dt>
                <dd>
                  时间重叠提供候选解释，不能证明因果关系，不能估算未经计算的损失。
                </dd>
              </dl>
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
