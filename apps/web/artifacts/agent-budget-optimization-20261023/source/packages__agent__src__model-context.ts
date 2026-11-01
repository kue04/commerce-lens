import { normalizeContext,type Context } from '@earendil-works/pi-ai';
import { ReportDraftSchema,type EvidenceDTO } from '../../contracts/src/http.js';
import type { PaymentTools } from './tools.js';

const previewLimit=10;
// Full evidence remains in the registry/HTTP export. The model gets one value
// representation, its exact scope, coverage and grain restrictions, without rows/hash duplication.
export function evidenceForModel(e:EvidenceDTO){
  let signal=e.signal;
  let signalPreview:object={};
  if(signal?.type==='promotion'){
    signalPreview={campaignCount:signal.campaigns.length,campaignsOmitted:Math.max(0,signal.campaigns.length-previewLimit)};
    signal={...signal,campaigns:signal.campaigns.slice(0,previewLimit)};
  }else if(signal?.type==='refund_reason'){
    signalPreview={reasonCount:signal.reasons.length,reasonsOmitted:Math.max(0,signal.reasons.length-previewLimit)};
    signal={...signal,reasons:signal.reasons.slice(0,previewLimit)};
  }
  return {
    evidenceId:e.id,kind:e.kind,status:e.status,metricId:e.metricId,
    scope:{filters:e.query.filters,groupBy:e.query.groupBy,currentWindow:e.query.currentWindow,baselineWindow:e.query.baselineWindow},
    coverage:e.coverage,baselineCoverage:e.baselineCoverage,note:e.note,
    ...(e.comparison?{comparison:e.comparison}:{}),
    ...(e.kind==='contribution'?{contributors:(e.contributors??[]).slice(0,previewLimit),contributorCount:e.contributors?.length??0,contributorsOmitted:Math.max(0,(e.contributors?.length??0)-previewLimit)}:{}),
    ...(signal?{signal,...signalPreview}:{}),
  };
}
export function modelToolResult(result:Awaited<ReturnType<PaymentTools['execute']>>){
  if(result.evidenceId){
    return {ok:result.ok,data:evidenceForModel(result.data as EvidenceDTO)};
  }
  return {ok:result.ok,data:result.data};
}
export function submissionContext(tools:PaymentTools,lastSubmissionError?:{code:string;message:string}):Context {
  return {
    systemPrompt:'预算收尾阶段。仅调用 submit_report，选择下列已注册证据ID。不得再查数据、填写事实/数值或编造引用。scope/coverage/note为权威范围与粒度限制；缺失证据不能支持解释。此前提交失败时更正ID，仅可修订一次。',
    // Submission selects references; individual contribution rows/observations
    // are already validated server-side and are not needed again in this turn.
    messages:[{role:'user',timestamp:0,content:JSON.stringify({question:tools.question,query:tools.query,lastSubmissionError,evidences:tools.evidences.map(e=>({evidenceId:e.id,kind:e.kind,status:e.status,metricId:e.metricId,filters:e.query.filters,groupBy:e.query.groupBy,coverage:e.coverage,baselineCoverage:e.baselineCoverage,note:e.note}))})}],
    tools:[{name:'submit_report',description:'仅选择本次已保存的比较、贡献和信号证据ID，服务端验证并生成报告',parameters:ReportDraftSchema}],
  };
}
export function inputUpperBound(context:Context){
  // Keep the conservative byte bound, but count the normalized context actually
  // sent to the provider, including system messages and tool schemas.
  return Buffer.byteLength(JSON.stringify(normalizeContext(context)),'utf8')+512;
}
