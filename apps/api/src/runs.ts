import { setImmediate as schedule } from 'node:timers';
import { DomainError,type QuerySpec } from '../../../packages/contracts/src/index.js';
import type { DatasetDTO,ExecutionMode,PhaseName,RunEventDTO } from '../../../packages/contracts/src/http.js';
import { AnalyticsService } from '../../../packages/analytics/src/service.js';
import { deterministicIntent } from '../../../packages/agent/src/intent.js';
import { RunBudget } from '../../../packages/agent/src/budget.js';
import { PaymentTools } from '../../../packages/agent/src/tools.js';
import type { PiPaymentRuntime } from '../../../packages/agent/src/pi.js';
import { active,Repository } from './repository.js';

const phases:PhaseName[]=['received','interpreting','checking_data','comparing','decomposing','inspecting','validating','persisting'];
export class Runs {
  private readonly queue:string[]=[];
  private readonly running=new Map<string,{controller:AbortController;promise:Promise<void>}>();
  private closed=false;
  constructor(readonly repository:Repository,readonly analytics:AnalyticsService,readonly dataset:(version:string)=>Promise<DatasetDTO>,readonly mode:ExecutionMode,readonly runtime?:PiPaymentRuntime,readonly timeoutMs=90000){}
  enqueue(id:string){if(!this.closed){this.queue.push(id);schedule(()=>this.pump());}}
  private pump(){
    while(!this.closed && this.running.size<2 && this.queue.length){
      const id=this.queue.shift()!,controller=new AbortController();
      const promise=this.execute(id,controller.signal).finally(()=>{this.running.delete(id);this.pump();});
      this.running.set(id,{controller,promise});
    }
  }
  private async phase(id:string,name:PhaseName){await this.repository.patch(id,{phase:phases.indexOf(name),phaseName:name},{type:'phase.changed',payload:{phase:phases.indexOf(name),phaseName:name,action:{received:'接收问题',interpreting:'确认分析口径',checking_data:'检查数据覆盖',comparing:'比较支付金额',decomposing:'拆分变化贡献',inspecting:'核查辅助证据',validating:'验证报告',persisting:'保存报告'}[name]}});}
  private async execute(id:string,cancel:AbortSignal){
    let budget=new RunBudget(cancel);let tools:PaymentTools|undefined;
    try{
      const row=await this.repository.run(id);
      if(!active(row.dto.status))return;
      const remaining=this.timeoutMs-(Date.now()-Date.parse(row.dto.createdAt));
      const signal=AbortSignal.any([cancel,AbortSignal.timeout(Math.max(0,remaining))]);
      budget=new RunBudget(signal);
      const dto=await this.repository.patch(id,{status:'running'},{type:'run.started',payload:{status:'running',executionMode:this.mode}});
      if(dto.status!=='running')return;
      await this.phase(id,'interpreting');
      const session=await this.repository.session(dto.sessionId),dataset=await this.dataset(session.dataset_version);
      const request=row.request_json,previous=session.state_json??undefined;
      const query=this.mode==='agent'?
        await this.runtime!.intent(request.question,dataset.businessClock,budget,request.confirmedIntent,previous):
        deterministicIntent(request.question,dataset.businessClock,request.confirmedIntent,previous);
      budget.check();
      if(!query){
        const clarification={question:'请确认支付金额、完整日期窗口和筛选范围。',metricId:'paid_amount' as const,date:dataset.businessClock,region:'east'};
        await this.repository.patch(id,{clarification},{type:'clarification.required',payload:{status:'needs_clarification',clarification}});
        await this.repository.finish(id,'needs_clarification','需要确认指标、时间或筛选',budget.usage);return;
      }
      // This gate runs outside model control and is repeated by every actual analytical query.
      await this.phase(id,'checking_data');
      const context={storeId:this.repository.identity.storeId,datasetVersion:session.dataset_version};
      await this.analytics.checkDataQuality(query,context,budget.signal);budget.check();
      tools=new PaymentTools(this.analytics,query,context,dataset,id,dto.sessionId,request.question,this.mode,this.runtime?.model.id??null,budget,{
        phase:name=>this.phase(id,name),saveEvidence:e=>this.repository.saveEvidence(e),
        event:(type,payload)=>this.repository.event(id,{type,payload} as Pick<RunEventDTO,'type'|'payload'> as Parameters<Repository['event']>[1]),
      });
      if(this.mode==='agent')await this.runtime!.analyze(tools);
      else{
        const comparison=await tools.execute('compare_metric',{...query,groupBy:'none'});
        const contribution=query.groupBy==='none'?undefined:await tools.execute('decompose_change',query);
        await tools.execute('submit_report',{comparisonEvidenceId:comparison.evidenceId,...(contribution?{contributionEvidenceId:contribution.evidenceId}:{})});
      }
      budget.check();await this.phase(id,'persisting');
      await this.repository.saveReport(tools.render(),budget.usage);
    }catch(error){
      const current=await this.repository.run(id);
      if(!active(current.dto.status))return;
      const signal=budget.signal;
      const aborted=signal.aborted;
      const timedOut=aborted && signal.reason instanceof Error && signal.reason.name==='TimeoutError';
      if(aborted){await this.repository.finish(id,timedOut?'timed_out':'cancelled',timedOut?'任务超过时间预算':'用户取消',budget.usage);return;}
      const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';
      const message=error instanceof DomainError?error.message:'分析失败，服务端保留错误类型，响应不包含内部堆栈';
      const partial=tools?.fallback();
      if(partial && code!=='INSUFFICIENT_DATA'){
        partial.limitations.push(`分析未完整完成：${message}`);
        await this.repository.saveReport(partial,budget.usage);
      }else await this.repository.finish(id,code==='INSUFFICIENT_DATA'?'insufficient_data':'failed',message,budget.usage);
    }
  }
  async cancel(id:string){
    const row=await this.repository.run(id);
    if(!active(row.dto.status))return row.dto;
    const dto=await this.repository.finish(id,'cancelled','用户取消',row.dto.usage);
    if(dto.status==='cancelled')this.running.get(id)?.controller.abort();
    return dto;
  }
  async close(){
    this.closed=true;
    for(const [id,task]of this.running){await this.repository.finish(id,'interrupted','服务关闭，任务中断',(await this.repository.run(id)).dto.usage);task.controller.abort();}
    await Promise.allSettled([...this.running.values()].map(t=>t.promise));
    for(const id of this.queue)await this.repository.finish(id,'interrupted','服务关闭，排队任务中断',(await this.repository.run(id)).dto.usage);
    this.queue.length=0;
  }
}
