import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createModels,type Context,type AssistantMessage,type Usage } from '@earendil-works/pi-ai';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import { fauxAssistantMessage,fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { signalSeed,publishSeed } from '../../db/seeds/generate.js';
import { PiPaymentRuntime } from '../../packages/agent/src/pi.js';
import { RunBudget } from '../../packages/agent/src/budget.js';
import { inputUpperBound } from '../../packages/agent/src/model-context.js';
import { buildApp } from '../../apps/api/src/app.js';
import { DomainError,type QuerySpec } from '../../packages/contracts/src/index.js';
import type { ReportDTO,RunDTO } from '../../packages/contracts/src/http.js';

let db:Awaited<ReturnType<typeof startLocalPostgres>>;
before(async()=>{db=await startLocalPostgres();await publishSeed(db.admin,signalSeed());},{timeout:60000});
after(async()=>{await db?.stop();});
const fixture=JSON.parse(await readFile(new URL('../fixtures/agent-budget-20261023.json',import.meta.url),'utf8')) as {
  sourceRunId:string;responses:{content:string;stopReason:'stop'|'toolUse';toolCalls:{name:string;arguments:Record<string,any>}[];usage:{prompt_tokens:number;completion_tokens:number;total_tokens:number}}[];
};
function usage(input:number,output:number):Usage{return {input,output,cacheRead:0,cacheWrite:0,totalTokens:input+output,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};}
async function waitRun(app:Awaited<ReturnType<typeof buildApp>>,id:string){
  for(let n=0;n<300;n++){
    const run=(await app.inject(`/api/runs/${id}`)).json() as RunDTO;
    if(!['queued','running'].includes(run.status))return run;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Replay failed to terminate');
}
test('four recorded DeepSeek responses reach a fifth submission turn with compact results; synthetic final response completes within unchanged budget',async()=>{
  const models=createModels();models.setProvider(deepseekProvider());
  let calls=0,networkCalls=0;
  const contexts:{call:number;inputUpperBound:number;tools:string[];modelRequests:number}[]=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{networkCalls++;throw new Error('All external network blocked during recorded replay');};
  let runId='';
  const runtime=new PiPaymentRuntime('deepseek-flash',models);
  models.completeSimple=async(model,context,options)=>{
    calls++;
    const tools=context.messages.flatMap(m=>m.role==='system'?m.toolsAdded??[]:context.tools??[]).map(t=>t.name);
    contexts.push({call:calls,inputUpperBound:inputUpperBound(context),tools,modelRequests:calls});
    let message:AssistantMessage;
    if(calls<=4){
      const row=fixture.responses[calls-1]!;
      message=fauxAssistantMessage([...row.content?[{type:'text' as const,text:row.content}]:[],...row.toolCalls.map(t=>fauxToolCall(t.name,t.arguments))],{stopReason:row.stopReason});
      message.usage=usage(row.usage.prompt_tokens,row.usage.completion_tokens);
    }else{
      assert.equal(calls,5,'replay never invents further exploration responses');
      assert.deepEqual(tools,['submit_report']);
      const saved=(await db.admin.query('SELECT dto FROM app.evidences WHERE run_id=$1 ORDER BY created_at',[runId])).rows.map(r=>r.dto);
      assert.equal(saved.length,6,'all four recorded signal calls really executed');
      const registry=JSON.stringify(context);
      for(const e of saved)assert.ok(registry.includes(e.id));
      message=fauxAssistantMessage(fauxToolCall('submit_report',{comparisonEvidenceId:saved.find(e=>e.kind==='comparison').id,contributionEvidenceId:saved.find(e=>e.kind==='contribution').id,signalEvidenceIds:saved.filter(e=>!['comparison','contribution'].includes(e.kind)).map(e=>e.id)}),{stopReason:'toolUse'});
      message.usage=usage(1000,150); // Explicit synthetic closing response; never described as a real model success.
    }
    assert.ok((options?.maxTokens??0)>=message.usage.output);
    return {...message,api:model.api,provider:model.provider,model:model.id};
  };
  const app=await buildApp({statePool:db.state,readerPool:db.reader,mode:'agent',runtime,recover:false});
  try{
    const session=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:'signals-v1'}})).json();
    const start=(await app.inject({method:'POST',url:`/api/sessions/${session.sessionId}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question:'昨天华东支付金额为什么下降？'}})).json();
    runId=start.runId;
    const run=await waitRun(app,runId);
    assert.equal(run.status,'completed',run.message);
    const report=(await app.inject(`/api/reports/${run.reportId}`)).json() as ReportDTO;
    assert.equal(calls,5);assert.equal(networkCalls,0);
    assert.equal(run.usage.modelRequests,5);assert.equal(run.usage.toolCalls,8);
    assert.equal(run.usage.tokens,13539+1150);
    assert.deepEqual(report.comparison,{current:7000000,baseline:10000000,delta:-3000000,changeRate:-0.3});
    assert.deepEqual(report.contributors.map(c=>c.delta),[-4000000,1000000]);
    // Independent header SQL checks each window; does not use production query compilation.
    for(const [window,expected]of [[report.query.currentWindow,7000000],[report.query.baselineWindow,10000000]] as const){
      const row=(await db.admin.query("SELECT sum(paid_amount_cents)::text AS total FROM business.orders WHERE dataset_version=$1 AND store_id=$2 AND region_id='east' AND payment_status='succeeded' AND paid_at >= $3 AND paid_at < $4",['signals-v1','store-demo',`${window.startDate}T00:00:00+08:00`,`${window.endDateExclusive}T00:00:00+08:00`])).rows[0];
      assert.equal(Number(row.total),expected);
    }
    assert.equal(report.evidences.length,6);
    assert.equal(report.provenance.promptVersion,'analysis-v3');
    assert.ok(report.evidences.every(e=>e.rows.length>0&&e.resultHash));
    assert.deepEqual((await app.inject(`/api/reports/${report.id}/export?format=json`)).json(),report);
    await mkdir('evals/results',{recursive:true});
    await writeFile('evals/results/agent-budget-optimization.json',JSON.stringify({mode:'offline replay: four recorded responses plus one synthetic submit_report response',sourceRunId:fixture.sourceRunId,networkCalls,run,contexts,report,independentSqlPassed:true,originalRecordedFifthInputUpperBound:24476,originalRemainingBudget:16461},null,2));
  }finally{await app.close();globalThis.fetch=originalFetch;}
});

test('budget fault after evidence preserves original code and message through HTTP, SSE and partial Markdown export',async()=>{
  const models=createModels();models.setProvider(deepseekProvider());
  let calls=0,runId='';
  class FaultRuntime extends PiPaymentRuntime {
    override async analyze(tools:Parameters<PiPaymentRuntime['analyze']>[0]){
      const reserve=tools.budget.request.bind(tools.budget);
      tools.budget.request=(...args:Parameters<RunBudget['request']>)=>{
        if(calls>=2)throw new DomainError('BUDGET_EXCEEDED','本地预算预检拒绝：剩余 token 不足，请求未发送');
        return reserve(...args);
      };
      return super.analyze(tools);
    }
  }
  const runtime=new FaultRuntime('deepseek-flash',models);
  const query=JSON.parse(fixture.responses[0]!.content).query as QuerySpec;
  models.completeSimple=async()=>{
    const name=calls++===0?'compare_metric':'decompose_change';
    const message=fauxAssistantMessage(fauxToolCall(name,query),{stopReason:'toolUse'});
    message.usage=usage(100,50);return message;
  };
  const app=await buildApp({statePool:db.state,readerPool:db.reader,mode:'agent',runtime,recover:false});
  try{
    const sid=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:'signals-v1'}})).json().sessionId;
    runId=(await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question:'支付分析（明确faux预算故障）',confirmedIntent:query}})).json().runId;
    const run=await waitRun(app,runId);
    assert.equal(run.status,'partial');assert.equal(calls,2);
    assert.match(run.message!,/预算预检.*请求未发送/);
    const report=(await app.inject(`/api/reports/${run.reportId}`)).json() as ReportDTO;
    assert.match(report.limitations.join(' '),/BUDGET_EXCEEDED/);
    assert.doesNotMatch(report.limitations.join(' '),/REPORT_NOT_SUBMITTED/);
    const events=(await db.admin.query('SELECT event_json FROM app.run_events WHERE run_id=$1 ORDER BY seq',[runId])).rows.map(r=>r.event_json);
    assert.equal(events.at(-1).payload.reason,'BUDGET_EXCEEDED');
    assert.match(events.at(-1).payload.message,/请求未发送/);
    const md=await app.inject(`/api/reports/${run.reportId}/export?format=md`);
    assert.match(md.body,/partial/);assert.match(md.body,/BUDGET\\_EXCEEDED/);
    const sse=await app.inject(`/api/runs/${runId}/events`);
    assert.match(sse.body,/BUDGET_EXCEEDED/);
  }finally{await app.close();}
});
