import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Value } from 'typebox/value';
import { buildApp } from '../../apps/api/src/app.js';
import { Repository,emptyUsage } from '../../apps/api/src/repository.js';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { acceptanceSeed,publishSeed } from '../../db/seeds/generate.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { DomainError } from '../../packages/contracts/src/index.js';
import { defaultWindows } from '../../packages/metrics/src/index.js';
import { RunSchema,RunEventSchema,ReportSchema,EvidenceSchema,ErrorSchema,type RunDTO } from '../../packages/contracts/src/http.js';
import { buildReport } from '../../packages/agent/src/report.js';

let db:Awaited<ReturnType<typeof startLocalPostgres>>,app:Awaited<ReturnType<typeof buildApp>>;
const query={metricId:'paid_amount',...defaultWindows('2026-10-22'),filters:{regionId:['east']},groupBy:'sku',topN:10};
const request={question:'昨天华东支付金额为什么下降？',confirmedIntent:query};
before(async()=>{
  db=await startLocalPostgres();await publishSeed(db.admin,acceptanceSeed());
  const missing=acceptanceSeed('missing-api');missing.sourceOverrides={order_items:{missing:['2026-10-21']}};await publishSeed(db.admin,missing);
  app=await buildApp({statePool:db.state,readerPool:db.reader,defaultDataset:'acceptance-v1'});await app.ready();
},{timeout:60000});
after(async()=>{await app?.close();await db?.stop();});
async function session(api=app,version='acceptance-v1'){
  const result=await api.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:version}});
  assert.equal(result.statusCode,201,result.body);return result.json().sessionId as string;
}
async function start(sid:string,payload:unknown=request,api=app,key=randomUUID()){
  const response=await api.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'idempotency-key':key},payload:payload as object});
  assert.equal(response.statusCode,202,response.body);return response.json().runId as string;
}
async function terminal(id:string,api=app):Promise<RunDTO>{
  for(let n=0;n<200;n++){
    const result=await api.inject({method:'GET',url:`/api/runs/${id}`});assert.equal(result.statusCode,200,result.body);
    const run=result.json() as RunDTO;
    if(!['queued','running'].includes(run.status))return run;
    await delay(10);
  }
  throw new Error('Run failed to terminate');
}
test('catalog, session, payment run, report, evidence, history and exports use actual PostgreSQL',async()=>{
  const catalog=await app.inject('/api/catalog');assert.equal(catalog.statusCode,200,catalog.body);assert.equal(catalog.json().executionMode,'deterministic');
  assert.equal((await app.inject('/api/health/ready')).statusCode,200);
  const sid=await session(),id=await start(sid),run=await terminal(id);
  assert.ok(Value.Check(RunSchema,run));assert.equal(run.status,'completed',run.message);assert.equal(run.usage.modelRequests,0);
  const response=await app.inject(`/api/reports/${run.reportId}`);assert.equal(response.statusCode,200,response.body);
  const report=response.json();assert.ok(Value.Check(ReportSchema,report));
  assert.equal(report.comparison.current,7000000);assert.equal(report.comparison.baseline,10000000);assert.equal(report.comparison.delta,-3000000);
  assert.equal(report.contributors[0]!.share,4/3);assert.equal(report.contributors[1]!.share,-1/3);
  assert.equal(report.provenance.agentExecuted,false);assert.equal(report.hypotheses.length,0);
  assert.equal(report.evidences.filter(e=>e.kind==='comparison'||e.kind==='contribution').length,2);
  for(const evidence of report.evidences){
    const result=await app.inject(`/api/evidences/${evidence.id}`);assert.equal(result.statusCode,200);
    assert.ok(Value.Check(EvidenceSchema,result.json()));assert.deepEqual(result.json(),evidence);
    assert.equal((await db.admin.query('SELECT dto FROM app.evidences WHERE evidence_id=$1',[evidence.id])).rows[0].dto.resultHash,evidence.resultHash);
  }
  for(const fact of report.facts)for(const ref of fact.evidenceIds)assert.ok(report.evidences.some((e:{id:string})=>e.id===ref));
  // JSONB reorders object keys; hash verification must survive persistence round trips.
  const stored=(await db.admin.query('SELECT dto FROM app.reports WHERE report_id=$1',[report.id])).rows[0].dto;
  const rerendered=buildReport({draft:{comparisonEvidenceId:stored.evidences[0].id,contributionEvidenceId:stored.evidences[1].id},evidences:stored.evidences,query:stored.query,dataset:stored.dataset,runId:stored.runId,sessionId:stored.sessionId,question:stored.question,mode:'deterministic',modelId:null,trace:[]});
  assert.equal(rerendered.comparison.current,7000000);
  const history=(await app.inject('/api/sessions?limit=30')).json();assert.ok(history.some((r:{reportId:string})=>r.reportId===report.id));
  const json=await app.inject(`/api/reports/${report.id}/export?format=json`);assert.deepEqual(json.json(),report);
  const md=await app.inject(`/api/reports/${report.id}/export?format=md`);assert.match(md.body,/未执行 Agent/);assert.match(md.body,/70000.00 元/);
  assert.equal((await app.inject({method:'POST',url:`/api/runs/${id}/cancel`,payload:{}})).json().status,'completed');
});
test('SSE replays saved events with monotonically increasing seq and Last-Event-ID',async()=>{
  const id=await start(await session());await terminal(id);
  const response=await app.inject(`/api/runs/${id}/events`);assert.equal(response.statusCode,200);assert.match(response.headers['content-type'] as string,/text\/event-stream/);
  const parse=(body:string)=>body.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  const events=parse(response.body);assert.ok(events.length>=8);
  for(const [index,event]of events.entries()){assert.equal(event.seq,index+1);assert.ok(Value.Check(RunEventSchema,event),JSON.stringify(event));}
  assert.equal(events.at(-1).type,'run.finished');assert.ok(events.some(e=>e.type==='report.ready'));
  const resume=await app.inject({url:`/api/runs/${id}/events`,headers:{'last-event-id':'3'}});assert.deepEqual(parse(resume.body),events.slice(3));
  assert.equal((await app.inject({url:`/api/runs/${id}/events`,headers:{'last-event-id':'999999'}})).statusCode,400);
});
test('canonical idempotency handles reordered JSON and rejects changed body',async()=>{
  const sid=await session(),key=randomUUID();
  const first=await start(sid,request,app,key);
  const second=await start(sid,{confirmedIntent:query,question:request.question},app,key);assert.equal(second,first);
  const conflict=await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'idempotency-key':key},payload:{...request,question:'different'}});
  assert.equal(conflict.statusCode,409);assert.ok(Value.Check(ErrorSchema,conflict.json()));
  await terminal(first);
  const otherStore=await buildApp({statePool:db.state,readerPool:db.reader,identity:{ownerId:'local-owner',storeId:'store-other'},recover:false});
  try{
    const replay=await otherStore.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'idempotency-key':key},payload:request});
    assert.equal(replay.statusCode,409);assert.equal(replay.json().runId,undefined);
  }finally{await otherStore.close();}
});
test('ambiguity stops with no evidence, clarification creates new run, follow-up recomputes',async()=>{
  const sid=await session(),id=await start(sid,{question:'数据异常'}),run=await terminal(id);
  assert.equal(run.status,'needs_clarification');assert.equal(run.usage.toolCalls,0);
  assert.equal((await db.admin.query('SELECT count(*) FROM app.evidences WHERE run_id=$1',[id])).rows[0].count,'0');
  const child=await start(sid,{...request,parentRunId:id}),answered=await terminal(child);assert.equal(answered.status,'completed');
  const follow=await start(sid,{question:'只看华东，再按渠道拆解'});const result=await terminal(follow);
  const report=(await app.inject(`/api/reports/${result.reportId}`)).json();assert.equal(report.query.groupBy,'channel');assert.deepEqual(report.query.filters,{regionId:['east']});
});
test('missing required source is insufficient_data without a misleading sales report',async()=>{
  const id=await start(await session(app,'missing-api')),run=await terminal(id);
  assert.equal(run.status,'insufficient_data');assert.equal(run.reportId,undefined);assert.match(run.message!,/order_items/);
});
test('unknown fields, SQL-like filters, unsupported metrics, today and nonlocal origins fail safely',async()=>{
  const sid=await session();
  for(const payload of [{...request,storeId:'other'},{...request,scenario:'success'},{question:'x'.repeat(2001)}]){
    const result=await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'idempotency-key':randomUUID()},payload});assert.equal(result.statusCode,400,result.body);
  }
  for(const payload of [
    {question:'今天支付金额为什么下降？'},
    {question:'昨天利润上升了'},
    {...request,confirmedIntent:{...query,filters:{skuId:["A'); DROP TABLE business.orders;--"]}}},
  ]){const run=await terminal(await start(sid,payload));assert.equal(run.status,'failed');assert.equal(run.reportId,undefined);}
  const forbidden=await app.inject({url:'/api/catalog',headers:{origin:'https://evil.example'}});assert.equal(forbidden.statusCode,403);
  assert.equal((await app.inject({url:'/api/catalog',headers:{host:'evil.example'}})).statusCode,403);
  assert.equal((await app.inject('/api/sessions?limit=0')).statusCode,400);
});
test('owner isolation covers session, run, report, evidence, export, and event routes',async()=>{
  const sid=await session(),id=await start(sid),run=await terminal(id),report=(await app.inject(`/api/reports/${run.reportId}`)).json();
  const other=await buildApp({statePool:db.state,readerPool:db.reader,identity:{ownerId:'other-owner',storeId:'store-demo'},recover:false});
  try{
    for(const path of [`/api/runs/${id}`,`/api/runs/${id}/events`,`/api/reports/${report.id}`,`/api/evidences/${report.evidences[0].id}`,`/api/reports/${report.id}/export`])assert.equal((await other.inject(path)).statusCode,404,path);
    assert.equal((await other.inject({method:'POST',url:`/api/runs/${id}/cancel`,payload:{}})).statusCode,404);
    assert.equal((await other.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'idempotency-key':randomUUID()},payload:request})).statusCode,404);
    assert.deepEqual((await other.inject('/api/sessions')).json(),[]);
  }finally{await other.close();}
});
test('application-state connection cannot read business data and query role cannot read app data',async()=>{
  await assert.rejects(()=>db.state.query('SELECT * FROM business.orders'),/permission denied/);
  await assert.rejects(()=>db.reader.query('SELECT * FROM app.sessions'),/permission denied/);
});
test('cancellation during a query never becomes success or submits later evidence',async()=>{
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  class HeldAnalytics extends AnalyticsService {override async analyze(...args:Parameters<AnalyticsService['analyze']>){entered();await gate;return super.analyze(...args);}}
  const held=await buildApp({statePool:db.state,readerPool:db.reader,analytics:new HeldAnalytics(db.reader),recover:false});
  try{
    const sid=await session(held),id=await start(sid,request,held);await started;
    const conflict=await held.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'idempotency-key':randomUUID()},payload:request});assert.equal(conflict.statusCode,409);
    const cancelled=await held.inject({method:'POST',url:`/api/runs/${id}/cancel`,payload:{}});assert.equal(cancelled.json().status,'cancelled');
    release();await delay(30);
    assert.equal((await terminal(id,held)).status,'cancelled');
    assert.equal((await db.admin.query('SELECT count(*) FROM app.reports WHERE run_id=$1',[id])).rows[0].count,'0');
    assert.equal((await db.admin.query('SELECT count(*) FROM app.evidences WHERE run_id=$1',[id])).rows[0].count,'0');
  }finally{release();await held.close();}
});
test('saved reports survive app rebuild and orphaned running jobs become interrupted',async()=>{
  const sid=await session(),id=await start(sid),done=await terminal(id);
  const repo=new Repository(db.state,{ownerId:'recovery-test',storeId:'store-demo'});
  const orphanSession=await repo.createSession('acceptance-v1');const orphan=await repo.createRun(orphanSession.sessionId,request as never,randomUUID(),'deterministic');
  await repo.patch(orphan.run.id,{status:'running'});
  const restarted=await buildApp({statePool:db.state,readerPool:db.reader,identity:repo.identity});
  try{assert.equal((await restarted.inject(`/api/runs/${orphan.run.id}`)).json().status,'interrupted');}
  finally{await restarted.close();}
  const restored=await buildApp({statePool:db.state,readerPool:db.reader,recover:false});
  try{assert.equal((await restored.inject(`/api/reports/${done.reportId}`)).json().comparison.current,7000000);}
  finally{await restored.close();}
});
test('agent mode without a configured runtime returns 503 instead of mock output',async()=>{
  const agent=await buildApp({statePool:db.state,readerPool:db.reader,mode:'agent',recover:false});
  try{assert.equal((await agent.inject('/api/health/ready')).statusCode,503);const sid=await session(agent);const response=await agent.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'idempotency-key':randomUUID()},payload:request});assert.equal(response.statusCode,503);assert.equal(response.json().code,'MODEL_NOT_CONFIGURED');}
  finally{await agent.close();}
});
test('a failed decomposition preserves observed payment evidence in an explicitly partial report',async()=>{
  class PartialAnalytics extends AnalyticsService {override async analyze(...args:Parameters<AnalyticsService['analyze']>){
    if((args[0] as {groupBy:string}).groupBy!=='none')throw new DomainError('TOOL_UNAVAILABLE','分解工具暂时不可用');return super.analyze(...args);
  }}
  const partial=await buildApp({statePool:db.state,readerPool:db.reader,analytics:new PartialAnalytics(db.reader),recover:false});
  try{
    const run=await terminal(await start(await session(partial),request,partial),partial);
    assert.equal(run.status,'partial');
    const report=(await partial.inject(`/api/reports/${run.reportId}`)).json();
    assert.equal(report.comparison.current,7000000);assert.equal(report.evidences.length,1);assert.equal(report.contributors.length,0);assert.match(report.limitations.join(' '),/分解工具暂时不可用/);
  }finally{await partial.close();}
});
test('wall-clock timeout persists timed_out instead of completing a delayed analysis',async()=>{
  class SlowAnalytics extends AnalyticsService {override async analyze(...args:Parameters<AnalyticsService['analyze']>){await delay(5000,undefined,{signal:args[2]});return super.analyze(...args);}}
  const timed=await buildApp({statePool:db.state,readerPool:db.reader,analytics:new SlowAnalytics(db.reader),recover:false,timeoutMs:100});
  try{
    const run=await terminal(await start(await session(timed),request,timed),timed);
    assert.equal(run.status,'timed_out');assert.equal(run.reportId,undefined);
  }finally{await timed.close();}
});
test('explicit SKU exclusion is expanded from authorized catalog and re-queries remaining products',async()=>{
  const sid=await session();await terminal(await start(sid));
  const run=await terminal(await start(sid,{question:'排除 A 呢？'}));assert.equal(run.status,'completed',run.message);
  const report=(await app.inject(`/api/reports/${run.reportId}`)).json();assert.deepEqual(report.query.filters.skuId,['B','C']);
  assert.equal(report.comparison.current,5000000);assert.equal(report.comparison.baseline,4000000);assert.equal(report.comparison.changeRate,0.25);
});
