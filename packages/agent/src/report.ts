import { createHash,randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Value } from 'typebox/value';
import { DomainError,parseQuerySpec,sumIntegers,safeInteger,type QuerySpec } from '../../contracts/src/index.js';
import { CONTRACT_VERSION,ReportDraftSchema,ReportSchema,EvidenceSchema, type DatasetDTO,type EvidenceDTO,type ExecutionMode,type ReportDraft,type ReportDTO,type TraceDTO } from '../../contracts/src/http.js';
import { METRIC_VERSION,metrics } from '../../metrics/src/index.js';
import { resultHash } from '../../analytics/src/hash.js';
import type { AnalyticsService } from '../../analytics/src/service.js';

export function sameScope(a:QuerySpec,b:QuerySpec) {
  return a.metricId===b.metricId && isDeepStrictEqual(a.currentWindow,b.currentWindow) && isDeepStrictEqual(a.baselineWindow,b.baselineWindow) && isDeepStrictEqual(a.filters,b.filters);
}
export function signalScope(a:QuerySpec,b:QuerySpec){
  return a.metricId===b.metricId && isDeepStrictEqual(a.currentWindow,b.currentWindow) && isDeepStrictEqual(a.baselineWindow,b.baselineWindow) &&
    (['channelId','regionId','skuId'] as const).every(key=>!b.filters[key] || (a.filters[key] && a.filters[key]!.every(id=>b.filters[key]!.includes(id))));
}
export function makeEvidence(result:Awaited<ReturnType<AnalyticsService['analyze']>>,runId:string,kind:'comparison'|'contribution'):EvidenceDTO {
  const e=result.evidence;
  const label=metrics[e.metricId].name,unit=e.metricId==='sold_units'?'件':'分';
  return {id:randomUUID(),runId,code:kind==='comparison'?'E01':'E02',title:`${label}${kind==='comparison'?'周期比较':'变化贡献'}`,kind,status:'success',metricId:e.metricId,query:e.querySpec,
    source:e.metricId==='refund_amount'?'PostgreSQL 成功退款事件聚合':'PostgreSQL 支付订单行聚合',datasetVersion:e.datasetVersion,metricVersion:e.metricVersion,createdAt:e.createdAt,coverage:1,baselineCoverage:1,
    columns:kind==='comparison'?[`本期（${unit}）`,`基期（${unit}）`,`变化（${unit}）`,'变化率']:['分组',`本期（${unit}）`,`基期（${unit}）`,`变化（${unit}）`,'贡献份额'],
    rows:kind==='comparison'?[[result.comparison.current,result.comparison.baseline,result.comparison.delta,result.comparison.changeRate]]:
      result.contributors.map(r=>[r.key,r.current,r.baseline,r.delta,r.share]),
    note:e.metricId==='refund_amount'?'仅成功退款按 succeeded_at 统计；不回写原支付周期。':'支付按 paid_at；金额为分整数、件数不扣后续退款，绑定不可变版本。',resultHash:e.resultHash,hashAlgorithm:e.hashAlgorithm,queryTemplateIds:e.queryTemplateIds,comparison:result.comparison,
    ...(kind==='contribution'?{contributors:result.contributors.map(r=>({...r,label:r.key}))}:{}),
  };
}
export function buildReport(options:{draft:unknown;evidences:EvidenceDTO[];query:QuerySpec;dataset:DatasetDTO;runId:string;sessionId:string;question:string;mode:ExecutionMode;modelId:string|null;trace:TraceDTO[];partial?:boolean}):ReportDTO {
  if(!Value.Check(ReportDraftSchema,options.draft))throw new DomainError('INVALID_REPORT_DRAFT','报告只允许选择已注册证据，不能直接填写事实或数字');
  const draft=options.draft as ReportDraft;
  if(options.query.groupBy!=='none' && !draft.contributionEvidenceId && !options.partial)throw new DomainError('MISSING_CONTRIBUTION','当前分析需要贡献分解证据；不足时仅能生成部分报告');
  const verify=(id:string,kind:EvidenceDTO['kind'])=>{
    const e=options.evidences.find(e=>e.id===id && e.runId===options.runId && e.kind===kind && e.status==='success');
    if(!e || e.datasetVersion!==options.dataset.version || e.metricVersion!==METRIC_VERSION || !sameScope(e.query,options.query))throw new DomainError('INVALID_EVIDENCE','证据不存在、跨运行或分析范围不匹配');
    if(!Value.Check(EvidenceSchema,e))throw new DomainError('INVALID_EVIDENCE','证据结构不合法');
    const comparison=e.comparison;
    if(!comparison || comparison.current===null || comparison.baseline===null || comparison.delta===null)throw new DomainError('REPORT_VALUE_MISMATCH','金额证据缺失');
    const current=safeInteger(comparison.current),baseline=safeInteger(comparison.baseline),delta=sumIntegers([current,-baseline]);
    if(delta!==comparison.delta || comparison.changeRate!==(baseline===0?null:delta/baseline))throw new DomainError('REPORT_VALUE_MISMATCH','比较数字不一致');
    const rawContributors=(e.contributors??[]).map(row=>({key:row.key,current:row.current,baseline:row.baseline,delta:row.delta,changeRate:row.changeRate,isOther:row.isOther,share:row.share}));
    if(kind==='contribution'){
      if(sumIntegers(rawContributors.map(r=>safeInteger(r.current)))!==current || sumIntegers(rawContributors.map(r=>safeInteger(r.baseline)))!==baseline)throw new DomainError('REPORT_VALUE_MISMATCH','贡献不守恒');
      for(const row of rawContributors){
        const change=sumIntegers([safeInteger(row.current),-safeInteger(row.baseline)]);
        if(row.delta!==change || row.share!==(delta===0?null:change/delta) || row.changeRate!==(row.baseline===0?null:change/row.baseline!))throw new DomainError('REPORT_VALUE_MISMATCH','贡献行数字不一致');
      }
    }
    const normalizedComparison={current:comparison.current,baseline:comparison.baseline,delta:comparison.delta,changeRate:comparison.changeRate};
    const legacyRows=rawContributors.map(row=>row.isOther?{key:row.key,isOther:true,current:row.current,baseline:row.baseline,delta:row.delta,changeRate:row.changeRate,share:row.share}:row);
    const expectedHash=e.hashAlgorithm==='sha256-canonical-json-v1'?resultHash({comparison:normalizedComparison,contributors:rawContributors}):createHash('sha256').update(JSON.stringify({comparison:normalizedComparison,contributors:legacyRows})).digest('hex');
    if(e.resultHash!==expectedHash)throw new DomainError('INVALID_EVIDENCE','证据结果 hash 不一致');
    return e;
  };
  const comparisonEvidence=verify(draft.comparisonEvidenceId,'comparison');
  const decomp=draft.contributionEvidenceId?verify(draft.contributionEvidenceId,'contribution'):undefined;
  const comparison=comparisonEvidence.comparison!;
  if(!comparison || comparison.current===null || comparison.baseline===null || comparison.delta===null || (decomp && !isDeepStrictEqual(decomp.comparison,comparison)))throw new DomainError('REPORT_VALUE_MISMATCH','比较与贡献证据不一致');
  const contributors=decomp?.contributors??[];
  const query=parseQuerySpec({...options.query,groupBy:decomp?.query.groupBy??'none',topN:decomp?.query.topN??10});
  const metric=metrics[query.metricId],display=(value:number)=>{
    safeInteger(value);if(query.metricId==='sold_units')return `${value} 件`;
    const cents=BigInt(value),abs=cents<0n?-cents:cents;return `${cents<0n?'-':''}${abs/100n}.${String(abs%100n).padStart(2,'0')} 元`;
  };
  const facts:ReportDTO['facts']=[{templateId:'comparison',text:`${metric.name}由 ${display(comparison.baseline)} 变为 ${display(comparison.current)}，变化 ${display(comparison.delta)}。`,evidenceIds:[comparisonEvidence.id],valueRefs:['comparison.baseline','comparison.current','comparison.delta']}];
  if(decomp)for(const row of contributors)facts.push({templateId:'contribution',text:`${row.label} ${metric.name}变化 ${display(row.delta!)}。`,evidenceIds:[decomp.id],valueRefs:[`contributors.${contributors.indexOf(row)}.delta`]});
  const hypotheses:ReportDTO['hypotheses']=[],unknowns:string[]=[];
  for(const id of draft.signalEvidenceIds??[]){
    const e=options.evidences.find(e=>e.id===id && e.runId===options.runId && signalScope(e.query,query) && e.datasetVersion===options.dataset.version && e.metricVersion===METRIC_VERSION);
    if(!e || !Value.Check(EvidenceSchema,e) || ['comparison','contribution'].includes(e.kind))throw new DomainError('INVALID_EVIDENCE','信号证据无效或范围不匹配');
    if(e.status==='missing'){unknowns.push(`${e.kind} 缺少完整数据，不能核查该解释。`);continue;}
    if(!e.signal || e.signal.type!==e.kind || e.resultHash!==resultHash({status:e.status,signal:e.signal,coverage:e.coverage,baselineCoverage:e.baselineCoverage,columns:e.columns,rows:e.rows,note:e.note}))throw new DomainError('INVALID_EVIDENCE','信号结果校验失败');
    const ref=[comparisonEvidence.id,e.id];
    if(e.signal.type==='inventory'){
      const s=e.signal;
      facts.push({templateId:'signal',text:`被核查库存池本期观测 ${s.current.observedHours}/${s.current.expectedHours} 小时，零库存 ${s.current.zeroHours} 小时；基期零库存 ${s.baseline.zeroHours} 小时。`,evidenceIds:[e.id],valueRefs:['signal.current','signal.baseline']});
      const skuIds=e.query.filters.skuId;
      if(!skuIds || skuIds.length!==1)unknowns.push('库存为多个或未分 SKU 的聚合观测，无法判断单个下降 SKU 的零库存变化。');
      if(query.metricId!=='refund_amount' && decomp && s.current.coverage>=0.95 && s.baseline.coverage>=0.95 && s.current.zeroHours>s.baseline.zeroHours && comparison.delta<0 && query.groupBy==='sku' && skuIds?.length===1 && contributors.some(c=>c.key===skuIds[0] && !c.isOther && c.delta!<0))hypotheses.push({text:'下降商品的零库存观测增加，与销售下降在时间上重叠，可能存在供应约束；不能证明全部下降由缺货造成。',evidenceIds:[...ref,decomp.id],missingEvidence:['缺少曝光、需求与精确补货数据，无法估计因果损失。']});
      if(s.current.coverage<0.95||s.baseline.coverage<0.95)unknowns.push('库存观测覆盖不足 95%，不能声称全天未缺货。');
    }else if(e.signal.type==='traffic'){
      const s=e.signal;facts.push({templateId:'signal',text:`已观测渠道与大区背景会话数由 ${s.baseline.sessions} 变为 ${s.current.sessions}，不代表 SKU 流量。`,evidenceIds:[e.id],valueRefs:['signal.baseline.sessions','signal.current.sessions']});
      if(e.coverage!==1||e.baselineCoverage!==1)unknowns.push('流量覆盖不足，已观测会话数不代表完整窗口总量。');
      if(s.attributionMatched && s.current.sessions<s.baseline.sessions && comparison.delta<0)hypotheses.push({text:'同口径渠道流量下降与经营指标下降同时出现，支持流量相关解释；不能直接归因到单个 SKU。',evidenceIds:ref,missingEvidence:['缺少 SKU 曝光和访问，尚不能证明因果。']});
    }else if(e.signal.type==='promotion'){
      if(e.signal.campaigns.length)hypotheses.push({text:'发现与比较窗口重叠的活动记录，需核实活动结束时间及影响；不能据此确定活动效果。',evidenceIds:ref,missingEvidence:['缺少活动曝光、价格和对照实验数据。']});
    }else{
      facts.push({templateId:'signal',text:`成功退款按客户原因码分组，共 ${e.signal.reasons.reduce((s,r)=>s+r.events,0)} 个退款事件；事件数不等于订单数。`,evidenceIds:[e.id],valueRefs:['signal.reasons']});
      unknowns.push('退款原因码是客户选择分类，不能证明产品质量事故；缺失原因码单列 unknown。');
    }
  }
  unknowns.push('可观测关联不能证明因果，无法估计因果损失。');
  if(!(draft.signalEvidenceIds?.length))unknowns.push('本次未核查库存、流量或退款原因信号，不能确认变化原因。');
  const ruleTriggered=query.metricId==='refund_amount'?comparison.delta>=5000 && comparison.changeRate!==null && comparison.changeRate>=0.3:query.metricId==='sold_units'?comparison.baseline>=20 && comparison.changeRate!==null && comparison.changeRate<=-0.2:comparison.baseline>=10000 && comparison.changeRate!==null && comparison.changeRate<=-0.15;
  const report:ReportDTO={id:randomUUID(),runId:options.runId,sessionId:options.sessionId,question:options.question,title:`${metric.name}变化分析`,status:options.partial?'partial':'completed',query,
    scopeLabel:`${query.filters.regionId?.join('、')??'全部大区'} · ${query.filters.skuId?.join('、')??'全部商品'}`,metricLabel:metric.name,unit:query.metricId==='sold_units'?'units':'fen',dataset:options.dataset,
    comparison,contributors,finding:ruleTriggered?`${metric.name}变化达到业务规则提示阈值，请核实。`:`${metric.name}变化未达到业务规则提示阈值。`,facts,hypotheses:hypotheses.slice(0,3).map(h=>({...h,contradictingEvidenceIds:[]})),
    unknowns,nextActions:['核实贡献较大的商品与渠道，补充相关源数据。'],
    limitations:['合成食品电商数据；固定演示业务时钟。','贡献分解表示变化来源，相关性不等于因果。',options.mode==='agent'?'报告事实由真实数据库工具结果渲染。':'确定性数据库分析模式，未执行 Agent 或调用模型。'],
    evidences:options.evidences,trace:options.trace,createdAt:new Date().toISOString(),
    provenance:{contractVersion:CONTRACT_VERSION,executionMode:options.mode,agentExecuted:options.mode==='agent',modelId:options.modelId,promptVersion:'analysis-v2',metricVersion:METRIC_VERSION,datasetVersion:options.dataset.version},
  };
  if(comparison.baseline===0)report.limitations.push('基期为零，变化率不可计算，显示为 null。');
  if(!Value.Check(ReportSchema,report))throw new DomainError('INVALID_REPORT','生成的报告不符合共享契约');
  return report;
}
