import { createHash,randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Value } from 'typebox/value';
import { Type,type Static } from 'typebox';
import { DomainError,QuerySpecSchema,parseQuerySpec,type QueryContext,type QuerySpec } from '../../contracts/src/index.js';
import { ReportDraftSchema,type DatasetDTO,type EvidenceDTO,type ExecutionMode,type ReportDTO,type ReportDraft,type TraceDTO,type PhaseName } from '../../contracts/src/http.js';
import { METRIC_VERSION,metrics } from '../../metrics/src/index.js';
import type { AnalyticsService } from '../../analytics/src/service.js';
import { buildReport,makeEvidence,sameScope } from './report.js';
import { RunBudget } from './budget.js';

export const SignalRequestSchema=Type.Object({signalType:Type.Union([Type.Literal('inventory'),Type.Literal('traffic'),Type.Literal('promotion'),Type.Literal('refund_reason')]),query:QuerySpecSchema},{additionalProperties:false});
export type ToolSink={phase:(name:PhaseName)=>Promise<void>;event:(type:'tool.started'|'tool.completed'|'tool.failed',payload:Record<string,unknown>)=>Promise<void>;saveEvidence:(e:EvidenceDTO)=>Promise<void>};
export class PaymentTools {
  readonly evidences:EvidenceDTO[]=[];
  readonly trace:TraceDTO[]=[];
  draft:ReportDraft|undefined;
  private cache=new Map<string,EvidenceDTO>();
  private reportFailures=0;
  constructor(readonly analytics:AnalyticsService,readonly query:QuerySpec,readonly context:QueryContext,readonly dataset:DatasetDTO,
    readonly runId:string,readonly sessionId:string,readonly question:string,readonly mode:ExecutionMode,readonly modelId:string|null,readonly budget:RunBudget,readonly sink:ToolSink){}
  private scoped(input:unknown){const query=parseQuerySpec(input);if(!sameScope(query,this.query))throw new DomainError('SCOPE_MISMATCH','工具查询不得改变已确认指标、时间或筛选');return query;}
  async execute(name:string,input:unknown,countAttempt=true){
    if(countAttempt)this.budget.tool();else this.budget.check();const started=performance.now(),toolCallId=randomUUID();
    const params=JSON.stringify(input);
    await this.sink.event('tool.started',{toolCallId,toolName:name,params});
    try {
      let data:unknown,evidence:EvidenceDTO|undefined;
      switch(name){
        case 'get_metric_definition':{
          const schema=Type.Object({metricId:Type.Literal('paid_amount')},{additionalProperties:false});
          if(!Value.Check(schema,input))throw new DomainError('INVALID_QUERY','仅支持支付金额定义');
          data={...metrics.paid_amount,metricVersion:METRIC_VERSION};break;
        }
        case 'check_data_quality':await this.sink.phase('checking_data');data=await this.analytics.checkDataQuality(this.scoped(input),this.context,this.budget.signal);break;
        case 'compare_metric':case 'decompose_change':{
          const query=this.scoped(input),kind=name==='compare_metric'?'comparison':'contribution';
          if(kind==='contribution' && query.groupBy==='none')throw new DomainError('INVALID_QUERY','分解需要指定维度');
          const actual=parseQuerySpec({...query,groupBy:kind==='comparison'?'none':query.groupBy});
          const key=JSON.stringify({name,actual});
          await this.sink.phase(kind==='comparison'?'comparing':'decomposing');
          evidence=this.cache.get(key);
          if(!evidence){
            const result=await this.analytics.analyze(actual,this.context,this.budget.signal);this.budget.check();
            evidence=makeEvidence(result,this.runId,kind);
            await this.sink.saveEvidence(evidence);this.evidences.push(evidence);this.cache.set(key,evidence);
          }
          data=evidence;break;
        }
        case 'inspect_signals':{
          if(!Value.Check(SignalRequestSchema,input))throw new DomainError('INVALID_QUERY','信号参数不符合契约');
          const request=input as Static<typeof SignalRequestSchema>,query=this.scoped(request.query);
          await this.sink.phase('inspecting');
          evidence={id:randomUUID(),runId:this.runId,code:`E${String(this.evidences.length+1).padStart(2,'0')}`,title:`${request.signalType} 证据不足`,kind:request.signalType==='inventory'?'inventory':request.signalType,status:'missing',metricId:'paid_amount',query,source:'当前已发布数据集无该信号源',datasetVersion:this.dataset.version,metricVersion:METRIC_VERSION,createdAt:new Date().toISOString(),coverage:null,baselineCoverage:null,columns:[],rows:[],note:'缺少数据不表示零值；不能据此解释销售变化。',resultHash:createHash('sha256').update(JSON.stringify({missing:request.signalType,version:this.dataset.version})).digest('hex'),queryTemplateIds:[]};
          await this.sink.saveEvidence(evidence);this.evidences.push(evidence);data=evidence;break;
        }
        case 'submit_report':{
          if(this.reportFailures>=2)throw new DomainError('REPORT_REPAIR_EXHAUSTED','报告修订机会已耗尽');
          await this.sink.phase('validating');
          try{this.render(input);this.draft=input as ReportDraft;data={accepted:true};}
          catch(error){this.reportFailures++;throw error;}
          break;
        }
        default:throw new DomainError('UNKNOWN_TOOL','工具不在白名单中');
      }
      this.budget.check();
      const durationMs=performance.now()-started;
      this.trace.push({name,params,status:evidence?.status==='missing'?'missing':'success',durationMs,...(evidence?{evidenceId:evidence.id}:{})});
      await this.sink.event('tool.completed',{toolCallId,toolName:name,durationMs,rowCount:evidence?.rows.length??0,...(evidence?{evidenceId:evidence.id}:{})});
      return {ok:true,data,evidenceId:evidence?.id,snapshotId:this.dataset.version,metricVersion:METRIC_VERSION};
    }catch(error){
      const code=error instanceof DomainError?error.code:'TOOL_FAILED';
      await this.sink.event('tool.failed',{toolCallId,toolName:name,code,retryable:false});
      throw error;
    }
  }
  render(draft:unknown=this.draft,partial=false):ReportDTO {
    return buildReport({draft,evidences:this.evidences,query:this.query,dataset:this.dataset,runId:this.runId,sessionId:this.sessionId,question:this.question,mode:this.mode,modelId:this.modelId,trace:this.trace,partial});
  }
  fallback():ReportDTO|null {
    const comparison=this.evidences.find(e=>e.kind==='comparison' && e.status==='success');
    if(!comparison)return null;
    const contribution=this.evidences.find(e=>e.kind==='contribution' && e.status==='success');
    return this.render({comparisonEvidenceId:comparison.id,...(contribution?{contributionEvidenceId:contribution.id}:{})},true);
  }
}
