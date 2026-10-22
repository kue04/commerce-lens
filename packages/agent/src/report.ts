import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Value } from 'typebox/value';
import { DomainError,parseQuerySpec,type QuerySpec } from '../../contracts/src/index.js';
import { ReportDraftSchema,ReportSchema, type DatasetDTO,type EvidenceDTO,type ExecutionMode,type ReportDraft,type ReportDTO,type TraceDTO } from '../../contracts/src/http.js';
import { METRIC_VERSION } from '../../metrics/src/index.js';
import type { AnalyticsService } from '../../analytics/src/service.js';

export function sameScope(a:QuerySpec,b:QuerySpec) {
  return a.metricId===b.metricId && isDeepStrictEqual(a.currentWindow,b.currentWindow) && isDeepStrictEqual(a.baselineWindow,b.baselineWindow) && isDeepStrictEqual(a.filters,b.filters);
}
export function makeEvidence(result:Awaited<ReturnType<AnalyticsService['analyze']>>,runId:string,kind:'comparison'|'contribution'):EvidenceDTO {
  const e=result.evidence;
  return {id:randomUUID(),runId,code:kind==='comparison'?'E01':'E02',title:kind==='comparison'?'支付金额周期比较':'支付金额变化贡献',kind,status:'success',metricId:e.metricId,query:e.querySpec,
    source:'PostgreSQL 支付订单行聚合',datasetVersion:e.datasetVersion,metricVersion:e.metricVersion,createdAt:e.createdAt,coverage:1,baselineCoverage:1,
    columns:kind==='comparison'?['本期（分）','基期（分）','变化（分）','变化率']:['分组','本期（分）','基期（分）','变化（分）','贡献份额'],
    rows:kind==='comparison'?[[result.comparison.current,result.comparison.baseline,result.comparison.delta,result.comparison.changeRate]]:
      result.contributors.map(r=>[r.key,r.current,r.baseline,r.delta,r.share]),
    note:'金额为分整数；支付按 paid_at，结果绑定不可变数据版本。',resultHash:e.resultHash,queryTemplateIds:e.queryTemplateIds,comparison:result.comparison,
    ...(kind==='contribution'?{contributors:result.contributors.map(r=>({...r,label:r.key}))}:{}),
  };
}
const money=(value:number)=>`${(value/100).toFixed(2)} 元`;
export function buildReport(options:{draft:unknown;evidences:EvidenceDTO[];query:QuerySpec;dataset:DatasetDTO;runId:string;sessionId:string;question:string;mode:ExecutionMode;modelId:string|null;trace:TraceDTO[];partial?:boolean}):ReportDTO {
  if(!Value.Check(ReportDraftSchema,options.draft))throw new DomainError('INVALID_REPORT_DRAFT','报告只允许选择已注册证据，不能直接填写事实或数字');
  const draft=options.draft as ReportDraft;
  const verify=(id:string,kind:EvidenceDTO['kind'])=>{
    const e=options.evidences.find(e=>e.id===id && e.runId===options.runId && e.kind===kind && e.status==='success');
    if(!e || e.datasetVersion!==options.dataset.version || e.metricVersion!==METRIC_VERSION || !sameScope(e.query,options.query))throw new DomainError('INVALID_EVIDENCE','证据不存在、跨运行或分析范围不匹配');
    return e;
  };
  const comparisonEvidence=verify(draft.comparisonEvidenceId,'comparison');
  const decomp=draft.contributionEvidenceId?verify(draft.contributionEvidenceId,'contribution'):undefined;
  const comparison=comparisonEvidence.comparison!;
  if(!comparison || comparison.current===null || comparison.baseline===null || comparison.delta===null || (decomp && !isDeepStrictEqual(decomp.comparison,comparison)))throw new DomainError('REPORT_VALUE_MISMATCH','比较与贡献证据不一致');
  const contributors=decomp?.contributors??[];
  const query=parseQuerySpec({...options.query,groupBy:decomp?.query.groupBy??'none',topN:decomp?.query.topN??10});
  const facts:ReportDTO['facts']=[{templateId:'comparison',text:`支付金额由 ${money(comparison.baseline)} 变为 ${money(comparison.current)}，变化 ${money(comparison.delta)}。`,evidenceIds:[comparisonEvidence.id],valueRefs:['comparison.baseline','comparison.current','comparison.delta']}];
  if(decomp)for(const row of contributors)facts.push({templateId:'contribution',text:`${row.label} 支付金额变化 ${money(row.delta!)}。`,evidenceIds:[decomp.id],valueRefs:[`contributors.${contributors.indexOf(row)}.delta`]});
  const ruleTriggered=comparison.baseline>=10000 && comparison.changeRate!==null && comparison.changeRate<=-0.15;
  const report:ReportDTO={id:randomUUID(),runId:options.runId,sessionId:options.sessionId,question:options.question,title:'支付金额变化分析',status:options.partial?'partial':'completed',query,
    scopeLabel:`${query.filters.regionId?.join('、')??'全部大区'} · ${query.filters.skuId?.join('、')??'全部商品'}`,metricLabel:'支付金额',unit:'fen',dataset:options.dataset,
    comparison,contributors,finding:ruleTriggered?'支付金额变化达到下降规则提示阈值，请结合贡献与缺失证据核实。':'支付金额变化未达到下降规则提示阈值。',facts,hypotheses:[],
    unknowns:['当前数据集未提供库存、流量和活动证据，无法确认变化原因或估计因果损失。'],nextActions:['核实贡献较大的商品与渠道，补充库存和流量数据。'],
    limitations:['合成食品电商数据；固定演示业务时钟。','贡献分解表示变化来源，相关性不等于因果。',options.mode==='agent'?'报告事实由真实数据库工具结果渲染。':'确定性数据库分析模式，未执行 Agent 或调用模型。'],
    evidences:options.evidences,trace:options.trace,createdAt:new Date().toISOString(),
    provenance:{contractVersion:'1.0.0',executionMode:options.mode,agentExecuted:options.mode==='agent',modelId:options.modelId,promptVersion:'payment-v1',metricVersion:METRIC_VERSION,datasetVersion:options.dataset.version},
  };
  if(!Value.Check(ReportSchema,report))throw new DomainError('INVALID_REPORT','生成的报告不符合共享契约');
  return report;
}
