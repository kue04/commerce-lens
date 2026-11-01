import { ArrowUpRight, Info } from "lucide-react";
import { useDatasetProfile } from "../lib/use-dataset-profile";
import type { AnalysisApi, Catalog, DatasetProfile } from "../lib/types";
import { Button } from "./ui";
import { OverviewPanel } from "./OverviewPanel";
import type { OverviewScope } from "../lib/overview-scope";

interface Props {
  api: AnalysisApi;
  catalog: Catalog | null;
  loading: boolean;
  version: string | null;
  onVersion: (version: string) => void;
  scope: OverviewScope;
  onScope: (scope: OverviewScope) => void;
  profile: boolean;
  onProfile: () => void;
  onMetrics: () => void;
}

export function DataPages({ api, catalog, loading, version, onVersion, scope, onScope, profile, onProfile, onMetrics }: Props) {
  const selectedVersion = version ?? catalog?.version;
  const dataset = catalog?.datasets.find((item) => item.version === selectedVersion);
  const detail = useDatasetProfile(api, dataset?.version);
  const data = detail.data;
  const versionPicker = <label className="dataset-picker" htmlFor="dataset-preview">{profile ? "查看数据集" : "演示数据"}
    <select id="dataset-preview" aria-label="查看数据集" value={selectedVersion ?? ""} disabled={!catalog || loading} onChange={(event) => onVersion(event.target.value)}>
      {!catalog && <option value="">{loading ? "正在读取数据目录…" : "数据目录未连接"}</option>}
      {catalog && !dataset && <option value={selectedVersion}>不可用版本：{selectedVersion}</option>}
      {catalog?.datasets.map((item) => <option value={item.version} key={item.version}>{datasetLabel(item.version)}</option>)}
    </select>
  </label>;
  const context = <><span>固定业务时钟 <strong>{dataset?.businessClock ?? "尚未取得"}</strong></span><span>{profile ? "完整截至日期" : "数据完整至"} <strong>{data?.lastCompleteDate ?? "尚未取得"}</strong></span></>;
  return <section className={`data-page ${profile ? "" : "business-overview"}`} aria-labelledby="data-page-title" aria-busy={loading || detail.loading}>
    {profile && <span className="eyebrow">KNOW YOUR DATA</span>}
    <div className="data-page-heading">
      <div>
        <h1 id="data-page-title">{profile ? "先了解数据，再看经营。" : "经营概览"}</h1>
        {profile ? <p className="muted">固定演示版本，无自动同步；刷新不会生成新数据。</p>
          : <div className="dataset-context overview-dataset-context"><span>合成演示数据</span>{context}</div>}
      </div>
      {!profile && <div className="overview-heading-actions">{versionPicker}<Button onClick={onProfile}>数据概况<ArrowUpRight size={16}/></Button></div>}
    </div>
    {profile && <div className="dataset-context">{versionPicker}{context}</div>}
    {catalog && !dataset && <div className="inline-alert error" role="alert"><Info size={18}/><p>该数据版本不在当前授权目录中。请选择可用版本，不会自动替换为其他数据。</p></div>}
    {detail.loading && <p className="profile-loading" role="status">正在读取 {dataset?.version} 的数据概况…</p>}
    {detail.error && <div className="inline-alert error" role="alert"><Info size={18}/><div><strong>数据概况读取失败</strong><p>{detail.error}</p><Button onClick={detail.retry}>重试数据概况</Button></div></div>}
    {profile ? <>
      <dl className="dataset-facts">
        {[
          ["数据来源", dataset ? "食品电商合成数据" : "尚未取得"],
          ["店铺", dataset?.storeName ?? "尚未取得"],
          ["数据版本", dataset?.version ?? "尚未取得"],
          ["业务时钟（固定）", dataset?.businessClock ?? "尚未取得"],
          ["时区", dataset?.timezone ?? "尚未取得"],
          ["版本发布时间", data?.publishedAt ?? "尚未取得"],
          ["核心数据完整区间", data?.coverageStart && data.lastCompleteDate ? `${data.coverageStart} 至 ${data.lastCompleteDate}` : "尚未取得"],
          ["总订单数（含支付失败）", data ? countFormat.format(data.counts.orders) : "尚未取得"],
          ["支付成功订单数", "后端尚未提供"],
          ["订单行记录数", data ? countFormat.format(data.counts.orderItems) : "尚未取得"],
          ["退款事件记录数（全部状态）", data ? countFormat.format(data.counts.refundEvents) : "尚未取得"],
          ["SKU / 渠道 / 大区数量", data ? `${data.counts.skus} / ${data.counts.channels} / ${data.counts.regions}` : "尚未取得"],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="profile-note">版本发布时间不代表同步或完整性。支付成功订单数与总订单数分别展示，当前不会根据总订单数推算成功订单。</p>
      {data && <ProfileSources data={data}/>}

      <Button onClick={onMetrics}>查看指标口径<ArrowUpRight size={16}/></Button>
    </> : <OverviewPanel api={api} profile={data} scope={scope} onScope={onScope}/>}
  </section>;
}

function datasetLabel(version: string): string {
  if (version === "signals-v1") return "经营演示";
  if (version === "acceptance-v1") return "基础验收数据";
  if (version === "portfolio-90d-v1") return "90天经营演示";
  const scenario = /^scenario-(S\d+)-v1$/.exec(version);
  return scenario ? `演示场景 ${scenario[1]}` : version;
}

const sourceNames = { orders: "订单", order_items: "订单行", refund_events: "退款事件", inventory: "库存观测", traffic: "渠道流量", promotion: "活动记录" };
const countFormat = new Intl.NumberFormat("zh-CN");

function ProfileSources({ data }: { data: DatasetProfile }) {
  return <>
    <h2 className="profile-section-title">数据源与覆盖</h2>
    <p className="muted">实际日期为记录中的最早 / 最晚日期；水位右端不含当天。完整截至日期遇到缺失分区即停止。</p>
    <div className="source-profiles">
      {data.sources.map((source) => <article className="source-profile" key={source.source} data-source={source.source}>
        <div className="source-profile-heading"><h3>{sourceNames[source.source]}</h3><span className={`source-status ${source.status}`}>{source.status === "available" ? "可用" : source.status === "partial" ? "覆盖不完整" : "缺少覆盖检查"}</span></div>
        <dl>
          <div><dt>粒度</dt><dd>{source.grain}</dd></div>
          <div><dt>实际记录数</dt><dd>{countFormat.format(source.rowCount)}</dd></div>
          <div><dt>实际记录日期</dt><dd>{source.actualStartDate ?? "无记录日期"} 至 {source.actualEndDate ?? "无记录日期"}</dd></div>
          <div><dt>覆盖起点</dt><dd>{source.coverageStart ?? "尚未取得"}</dd></div>
          <div><dt>水位（不含当天）</dt><dd>{source.completeThrough ?? "尚未取得"}</dd></div>
          <div><dt>完整截至日期</dt><dd>{source.lastCompleteDate ?? "尚未取得"}</dd></div>
          <div><dt>缺失分区</dt><dd>{source.status === "missing" ? "尚未检查" : source.missingPartitions.length ? source.missingPartitions.join("、") : "未声明缺失分区"}</dd></div>
          <div><dt>覆盖检查时间</dt><dd>{source.checkedAt ?? "尚未取得"}</dd></div>
        </dl>
        {source.reason && <p className="profile-note">{source.reason}</p>}
        {source.source === "inventory" && <p className="profile-note">库存按 SKU × 大区库存池 × 小时观测，记录数不等于缺货时长。</p>}
        {source.source === "traffic" && <p className="profile-note">流量记录数按渠道 × 大区 × 日期计数，不等于自然日数。</p>}
        {source.source === "promotion" && <p className="profile-note">活动结束日期为排他生效边界，不代表交易发生日期。</p>}
      </article>)}
    </div>
    <h2 className="profile-section-title">指标口径与所需数据源</h2>
    <div className="profile-definitions">{data.metrics.map((metric) => <article key={metric.metricId}>
      <h3>{metric.label}</h3><p>{metric.definition}</p><p className="muted">所需数据源：{metric.requiredSources.map((source) => sourceNames[source]).join("、")} · 口径版本 {metric.metricVersion} · {metric.unit === "fen" ? "金额按整数分记录" : "数量按件记录"}</p>
    </article>)}</div>
    <details className="profile-dictionary"><summary>当前版本的渠道、大区和 SKU</summary>{(["channelId", "regionId", "skuId"] as const).map((key) => <p key={key}><strong>{key === "channelId" ? "渠道" : key === "regionId" ? "大区" : "SKU"}：</strong>{data.filters[key].map((item) => `${item.label}（${item.value}）`).join("、") || "无字典记录"}</p>)}</details>
  </>;
}
