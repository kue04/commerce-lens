import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ClipboardList,
  Download,
  Info,
  MessageCircle,
} from "lucide-react";
import type { Report } from "../lib/types";
import { metricValue, money, rate } from "../lib/format";
import { Button, Segments } from "./ui";
import { ContributionChart } from "./Chart";
import { phases } from "../lib/presentation";

export function ReportView({
  report: r,
  openEvidence,
  onExport,
  exporting,
}: {
  report: Report;
  openEvidence: (id: string, element: HTMLElement) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const [display, setDisplay] = useState("chart");
  const [showFacts, setShowFacts] = useState(true);
  const down = (r.comparison.delta ?? 0) < 0;
  const incompleteReason = r.limitations.find((text) => text.startsWith("分析未完整完成"));
  const evidence = (code: string) => r.evidences.find((e) => e.code === code);
  const referenceId = (id: string) => {
    const item = r.evidences.find((e) => e.id === id);
    return item ? (
      <button
        key={id}
        className="evidence-ref"
        onClick={(event) =>
          openEvidence(id, event.currentTarget)
        }
        aria-label={`查看证据 ${item.code}`}
      >
        {item.code}
        <ArrowUpRight size={12} />
      </button>
    ) : null;
  };
  const reference = (code: string) => evidence(code) ? referenceId(evidence(code)!.id) : null;
  return (
    <motion.article
      className="report"
      key={r.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="report-header">
        <div>
          <span className="eyebrow">PERFORMANCE REVIEW</span>
          <h1>{r.title}</h1>
          <p className="report-subtitle">
            {r.query.currentWindow.startDate
              .replace("-", " 年 ")
              .replace("-", " 月 ")}{" "}
            日<span>·</span>对比 {r.query.baselineWindow.startDate}<span>·</span>
            {r.metricLabel}
          </p>
        </div>
        <div className="report-actions">
          <Button onClick={onExport} disabled={exporting}>
            <Download size={16} />
            导出报告
          </Button>
          <span
            className={`completed-label ${r.status === "partial" ? "warning-text" : ""}`}
          >
            <Check size={13} />
            {r.status === "partial" ? "部分成功" : "分析完成"}
          </span>
        </div>
      </header>
      {r.status === "partial" && (
        <div className="inline-alert" role="status" aria-label="分析未完整完成">
          <Info size={18} />
          <div>
            <strong>分析未完整完成</strong>
            <p>{incompleteReason ?? "部分步骤未完成，以下保留已验证的数据与证据，请结合数据限制查看。"}</p>
          </div>
        </div>
      )}
      <div className="question-row">
        <div className="question">
          <MessageCircle size={22} fill="currentColor" strokeWidth={1.4} />
          <strong>{r.question}</strong>
        </div>
        <ol className="completed-phases" aria-label="执行阶段">
          {phases.map((phase, index) => (
            <li key={phase}>
              {index === 2 && r.query.groupBy === "channel"
                ? "渠道拆解"
                : phase}
              <Check size={14} />
            </li>
          ))}
        </ol>
      </div>
      <div className="scope-line">
        <span>{r.scopeLabel}</span>
        <span>
          {r.query.filters.channelId?.join("、") ?? "全渠道"}
        </span>
        <button
          onClick={(event) =>
            r.evidences.length &&
            openEvidence(
              (evidence("E01") ?? r.evidences[0])!.id,
              event.currentTarget,
            )
          }
        >
          查看分析口径
          <ArrowUpRight size={12} />
        </button>
      </div>
      <section className="metrics" aria-label="关键指标">
        <div className="metric-primary">
          <p>本期{r.metricLabel}</p>
          <div className="metric-value-row">
            <strong className="hero-number">
              {r.comparison.current === null ? (
                "—"
              ) : r.unit === "fen" ? (
                <>
                  <span className="currency">¥</span>
                  {money(r.comparison.current, false, 2).slice(1).split(".")[0]}
                  <span className="decimal">
                    .{money(r.comparison.current, false, 2).split(".")[1]}
                  </span>
                </>
              ) : (
                metricValue(r.comparison.current, r.unit)
              )}
            </strong>
            <span className={`change-badge ${down ? "negative" : "positive"}`}>
              {down ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
              {r.comparison.changeRate === null
                ? "不可计算"
                : rate(Math.abs(r.comparison.changeRate))}
            </span>
          </div>
        </div>
        <div className="metric-secondary">
          <p>基期 {r.query.baselineWindow.startDate}</p>
          <strong>{metricValue(r.comparison.baseline, r.unit)}</strong>
        </div>
        <div className="metric-secondary">
          <p>变化{r.unit === "fen" ? "金额" : "件数"}</p>
          <strong className={down ? "negative-text" : "positive-text"}>
            {metricValue(r.comparison.delta, r.unit, true)}
          </strong>
        </div>
      </section>
      <section className="finding" aria-label="核心发现">
        <p>
          {r.finding}
        </p>
        {reference("E02")}
      </section>
      <section className="contribution-section">
        <div className="section-heading">
          <h2>变化来自哪些{r.query.groupBy === "channel" ? "渠道" : r.query.groupBy === "region" ? "地区" : "商品"}</h2>
          <Segments
            value={display}
            onChange={setDisplay}
            label="贡献展示方式"
            items={[
              { value: "chart", label: "图表" },
              { value: "table", label: "明细" },
            ]}
          />
        </div>
        {r.contributors.length ? (
          display === "chart" ? (
            <ContributionChart report={r} />
          ) : (
            <div className="table-scroll contribution-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{r.query.groupBy === "channel" ? "渠道" : "商品"}</th>
                    <th>本期</th>
                    <th>基期</th>
                    <th>变化额</th>
                    <th>贡献份额</th>
                  </tr>
                </thead>
                <tbody>
                  {r.contributors.map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>{metricValue(c.current, r.unit)}</td>
                      <td>{metricValue(c.baseline, r.unit)}</td>
                      <td
                        className={
                          (c.delta ?? 0) < 0 ? "negative-text" : "positive-text"
                        }
                      >
                        {metricValue(c.delta, r.unit, true)}
                      </td>
                      <td>{rate(c.share, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="empty-chart">
            <Info size={24} />
            <p>范围内暂无交易记录</p>
            <span>真实零值保留；基期为零时变化率不可计算。</span>
          </div>
        )}
        <p className="chart-caption">
          {r.comparison.delta === 0 ? (
            "本期与基期均无交易记录，无可分解的变化。"
          ) : (
            <>
              合计{down ? "减少" : "增加"}{" "}
              {metricValue(Math.abs(r.comparison.delta ?? 0), r.unit)}
              {r.contributors.some((c) => (c.delta ?? 0) > 0) && down
                ? "，增长项抵消部分下降。"
                : "；各分组变化与总量一致。"}
            </>
          )}{" "}
          {reference("E02")}
        </p>
      </section>
      <section className="insights">
        <div>
          <h3>
            <span className="amber-dot" />
            可能解释
          </h3>
          {r.hypotheses.length ? (
            <>
              {r.hypotheses.map((h, index) => (
                <div key={index}>
                  <p className="hypothesis-text">
                    {h.text}{" "}{h.evidenceIds.map(referenceId)}
                  </p>
                  {h.contradictingEvidenceIds?.length ? <p className="small muted">
                    反证：{h.contradictingEvidenceIds.map(referenceId)}
                  </p> : null}
                  {h.missingEvidence.length > 0 && <p className="small muted">待核实：{h.missingEvidence.join("；")}</p>}
                </div>
              ))}
              <p className="small muted">
                相关观测仅提供候选解释，尚不能证明因果关系。
              </p>
            </>
          ) : (
            <>
              <p>
                {r.status === "partial"
                  ? "部分证据不可用，暂不能完整解释变化。"
                  : "当前证据不足以确认变化原因。"}
              </p>
              <p className="small muted">
                保留已确认事实，不将相关性写成因果。
              </p>
            </>
          )}
        </div>
        <div>
          <h3>
            <ClipboardList size={18} />
            建议核实
          </h3>
          <ol>
            {r.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="facts-section">
        <button
          className="facts-toggle"
          onClick={() => setShowFacts(!showFacts)}
          aria-expanded={showFacts}
        >
          <CheckCheck size={16} />
          已确认事实与数据限制<span>{showFacts ? "收起 −" : "展开 +"}</span>
        </button>
        {showFacts && (
          <div className="facts-content">
            {r.facts.map((fact, i) => (
              <p key={i}>
                {fact.text}{" "}
                {fact.evidenceIds.map((id) => (
                  <button
                    key={id}
                    className="evidence-ref"
                    onClick={(event) => openEvidence(id, event.currentTarget)}
                  >
                    {r.evidences.find((e) => e.id === id)?.code}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </p>
            ))}
            <h4>缺失信息</h4>
            {r.unknowns.map((s) => (
              <p className="muted" key={s}>
                {s}
              </p>
            ))}
            <p className="small muted">{r.limitations.join(" ")}</p>
          </div>
        )}
      </section>
    </motion.article>
  );
}
