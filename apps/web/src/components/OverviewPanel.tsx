import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Info, SlidersHorizontal } from "lucide-react";
import type { AnalysisApi, DatasetProfile, QuerySpec } from "../lib/types";
import { filterKeys, overviewQuery, scopeError, type OverviewScope } from "../lib/overview-scope";
import { useOverview } from "../lib/use-overview";
import { metricValue, rate } from "../lib/format";
import { shiftDate } from "../lib/presentation";
import { OverviewTrend } from "./Chart";
import { Button } from "./ui";

const metrics = [["paid_amount", "支付金额"], ["refund_amount", "成功退款金额"], ["sold_units", "支付件数"]] as const;
const filterNames = { channelId: "渠道", regionId: "大区", skuId: "SKU" };
export function windowLabel(window: QuerySpec["currentWindow"]): string {
  const last = shiftDate(window.endDateExclusive, -1);
  return window.startDate === last ? last : `${window.startDate} 至 ${last}`;
}

export function OverviewPanel({ api, profile, scope, onScope }: {
  api: AnalysisApi; profile: DatasetProfile | null; scope: OverviewScope; onScope: (scope: OverviewScope) => void;
}) {
  const invalid = profile ? scopeError(scope, profile) : null;
  const query = profile && !invalid ? overviewQuery(profile.dataset.businessClock, scope) : null;
  const result = useOverview(api, profile?.dataset.version, query);
  const data = result.data;
  const selected = data?.metrics.find((metric) => metric.metricId === scope.metricId);
  const hasFilters = Object.keys(scope.filters).length > 0;
  const [filtersOpen, setFiltersOpen] = useState(hasFilters);
  useEffect(() => { if (hasFilters) setFiltersOpen(true); }, [hasFilters]);
  const compareLabel = scope.days === 1 ? "较上周同日" : scope.days === 7 ? "较前7天" : "较前30天";
  return <div className="overview-panel" aria-busy={result.loading}>
    <div className="overview-toolbar">
      <label className="overview-period"><span className="sr-only">比较周期</span><select aria-label="比较周期" value={scope.days} onChange={(event) => onScope({ ...scope, days: Number(event.target.value) as OverviewScope["days"] })}>
        <option value="1">昨天 · 对上周同日</option><option value="7">近7天 · 对前7天</option><option value="30">近30天 · 对前30天</option>
      </select></label>
      {data && <p className="overview-window" id="overview-window"><span>本期 {windowLabel(data.query.currentWindow)}</span><span>对比 {windowLabel(data.query.baselineWindow)}</span></p>}
      <Button className="overview-filter-toggle" aria-expanded={filtersOpen} aria-controls="overview-filter-fields" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16}/>筛选{hasFilters && <span className="filter-applied">已应用</span>}<ChevronDown size={14}/></Button>
    </div>
    {hasFilters && !filtersOpen && <p className="overview-active-filters">当前筛选：{filterKeys.filter((key) => scope.filters[key]?.length).map((key) => `${filterNames[key]} ${scope.filters[key]!.map((value) => profile?.filters[key].find((item) => item.value === value)?.label ?? value).join("、")}`).join(" · ")}</p>}
    <div className="overview-filters" id="overview-filter-fields" hidden={!filtersOpen}>
      {filterKeys.map((key) => <label key={key}>{filterNames[key]}筛选<select aria-label={`${filterNames[key]}筛选`} disabled={!profile}
        value={scope.filters[key]?.[0] ?? ""} onChange={(event) => {
          const filters = { ...scope.filters };
          if (event.target.value) filters[key] = [event.target.value]; else delete filters[key];
          onScope({ ...scope, filters });
        }}>
        <option value="">全部{filterNames[key]}</option>
        {scope.filters[key]?.filter((value) => !profile?.filters[key].some((item) => item.value === value)).map((value) => <option key={value} value={value}>不可用：{value}</option>)}
        {profile?.filters[key].map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
      </select>{(scope.filters[key]?.length ?? 0) > 1 && <small>已从链接恢复：{scope.filters[key]!.join("、")}</small>}</label>)}
      <Button onClick={() => onScope({ ...scope, filters: {} })} disabled={!hasFilters}>清除筛选</Button>
    </div>
    {invalid && <div className="inline-alert error" role="alert"><Info size={18}/><p>{invalid}</p></div>}
    {result.loading && <p role="status" className="profile-loading">正在读取经营概览…</p>}
    {result.error && <div className="inline-alert error" role="alert"><Info size={18}/><div><strong>经营概览读取失败</strong><p>{result.error}</p><Button onClick={result.retry}>重试经营概览</Button></div></div>}
    {!profile && <p className="profile-note">取得当前版本的数据概况与授权字典后显示经营概览。</p>}
    <div className="overview-metrics" aria-label="经营指标">
      {metrics.map(([id, label]) => {
        const metric = data?.metrics.find((item) => item.metricId === id);
        const comparison = metric?.comparison;
        const change = comparison?.changeRate;
        const direction = change == null ? "unavailable" : change < 0 ? "down" : change > 0 ? "up" : "flat";
        return <article key={id} data-metric={id} aria-describedby={data ? "overview-window" : undefined} className={scope.metricId === id ? "selected" : ""}>
          <h2><button aria-label={`${label}查看趋势`} aria-pressed={scope.metricId === id} onClick={() => onScope({ ...scope, metricId: id })}>{label}<span>{scope.metricId === id ? "趋势已选" : "查看趋势"}</span></button></h2>
          {metric && comparison ? <><p className="overview-value">{metricValue(comparison.current, metric.unit)}</p>
            <p className={`overview-change ${direction}`}><strong>{change != null && (change < 0 ? <ArrowDownRight size={18}/> : change > 0 ? <ArrowUpRight size={18}/> : null)}{rate(comparison.changeRate, true)}</strong><span>{compareLabel}</span></p>
            <dl className="overview-comparison"><div><dt>基期</dt><dd>{metricValue(comparison.baseline, metric.unit)}</dd></div><div><dt>差值</dt><dd>{metricValue(comparison.delta, metric.unit, true)}</dd></div></dl>
            {comparison.baseline === 0 && <p className="overview-card-note">基期为零，变化率不可计算。</p>}
            {!metric.availability.available && <p className="overview-card-note">数据不可用：{metric.availability.reason}</p>}
          </> : <p className="metric-unavailable">{result.loading ? "读取中…" : "尚未取得"}</p>}
        </article>;
      })}
    </div>
    {data && selected && <>
      {!data.availability.available && <p className="inline-alert" role="status">当前指标比较范围无可用完整数据：{data.availability.reason}。趋势按日独立标注可用性。</p>}
      <div className="overview-insights">
        <section className="overview-trend" aria-labelledby="trend-title">
          <h2 id="trend-title">{selected.label} · 近30天日趋势</h2>
          <p className="overview-trend-period">{windowLabel(data.trend.currentWindow)}<span>与 {data.trend.offsetDays} 天前逐日对比</span></p>
          <OverviewTrend data={data} unit={selected.unit}/>
          <p className="overview-chart-note">实线：本期　虚线：配对基期　缺失数据以断点显示</p>
        </section>
        <section className="overview-changes" aria-labelledby="changes-title">
          <div className="overview-section-heading"><h2 id="changes-title">规则提示</h2><span>{data.changes.length} 条</span></div>
          <p className="overview-rules-note">待核实的变化线索，不代表统计显著性或已证实原因。</p>
          {data.changes.length ? <ol>{data.changes.map((change) => <li key={change.ruleId}>
            <strong className="overview-rule-title">{change.contributor ? `${profile?.filters.skuId.find((item) => item.value === change.contributor!.key)?.label ?? change.contributor.label}（SKU ${change.contributor.key}）` : `${selected.label}整体变化`}</strong>
            <p className="overview-rule-delta">{metricValue(change.comparison.delta, selected.unit, true)}<span>{rate(change.comparison.changeRate, true)}</span></p>
            <p className="overview-rule-values">本期 {metricValue(change.comparison.current, selected.unit)} · 基期 {metricValue(change.comparison.baseline, selected.unit)}</p>
            {change.contributor && <p className="overview-rule-values">贡献份额 {rate(change.contributor.share, true)}</p>}
            <details className="overview-rule-details"><summary>查看规则说明</summary><p>{change.title}</p></details>
          </li>)}</ol> : <p className="profile-note">{data.availability.available ? "当前范围没有触发规则提示。" : "数据不足，无法给出规则提示。"}</p>}
        </section>
      </div>
      <details className="overview-trend-table"><summary>查看30天趋势数据表</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="30天趋势数据表，可横向滚动">
        <table className="data-table"><caption>{selected.label}每日比较，金额展示为元、数量为件</caption><thead><tr>{["本期日期", "基期日期", "本期", "基期", "差值", "变化率", "可用性"].map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{data.trend.points.map((point) => <tr key={point.date}><th scope="row">{point.date}</th><td>{point.baselineDate}</td><td>{metricValue(point.comparison.current, selected.unit)}</td><td>{metricValue(point.comparison.baseline, selected.unit)}</td><td>{metricValue(point.comparison.delta, selected.unit, true)}</td><td>{rate(point.comparison.changeRate, true)}</td><td>{point.currentAvailability.available ? "本期可用" : `本期：${point.currentAvailability.reason}`}；{point.baselineAvailability.available ? "基期可用" : `基期：${point.baselineAvailability.reason}`}</td></tr>)}</tbody></table>
      </div></details>
      <details className="overview-provenance"><summary>数据与口径详情</summary>
        <dl><div><dt>数据版本</dt><dd>{data.dataset.version}</dd></div><div><dt>固定业务时钟</dt><dd>{data.dataset.businessClock} · Asia/Shanghai</dd></div>
          <div><dt>完整截至日期</dt><dd>{profile?.lastCompleteDate ?? "尚未取得"}</dd></div><div><dt>版本发布时间</dt><dd>{data.dataset.updatedAt}</dd></div><div><dt>本次计算时间</dt><dd>{data.generatedAt}</dd></div></dl>
        <p>指标卡本期：{windowLabel(data.query.currentWindow)}；基期：{windowLabel(data.query.baselineWindow)}。</p>
        <p>趋势本期：{windowLabel(data.trend.currentWindow)}；配对基期：{windowLabel(data.trend.baselineWindow)}。日趋势固定30天，与指标卡的1/7/30天比较周期分别展示。</p>
        <p>按 Asia/Shanghai 自然日统计；接口窗口右端不含当天。金额以整数分记录，展示为元；数量为件。缺失不补零，基期为零时不计算变化率。</p>
        {profile?.metrics.map((metric) => <p key={metric.metricId}><strong>{metric.label}：</strong>{metric.definition}</p>)}
        <p>合成数据，固定演示版本，无自动同步；刷新不会生成新数据。版本发布时间不代表数据完整性。</p>
        <p>确定性计算 · 真实 PostgreSQL · 口径 {data.metricVersion} · 规则 {data.ruleVersion} · 未执行模型</p>
      </details>
    </>}
  </div>;
}
