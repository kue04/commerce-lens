import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { acceptanceSeed,signalSeed,generateSeed,publishSeed } from '../../db/seeds/generate.js';
import { buildApp } from '../../apps/api/src/app.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { PaymentTools } from '../../packages/agent/src/tools.js';
import { RunBudget } from '../../packages/agent/src/budget.js';
import { defaultWindows } from '../../packages/metrics/src/index.js';
import { SignalService } from '../../packages/analytics/src/signals.js';
let db:Awaited<ReturnType<typeof startLocalPostgres>>;
const query={metricId:'paid_amount' as const,...defaultWindows('2026-10-22'),filters:{regionId:['east']},groupBy:'sku' as const};
before(async()=>{db=await startLocalPostgres();await publishSeed(db.admin,signalSeed());},{timeout:60000});
after(async()=>{await db?.stop();});
test('deleting a running session aborts its actual query before removing dependent records',async()=>{
  let notify!:()=>void;const entered=new Promise<void>(resolve=>{notify=resolve;});
  class Slow extends AnalyticsService {override async analyze(...args:Parameters<AnalyticsService['analyze']>){notify();await delay(10000,undefined,{signal:args[2]});return super.analyze(...args);}}
  const app=await buildApp({statePool:db.state,readerPool:db.reader,analytics:new Slow(db.reader)});
  try{
    const sid=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:'signals-v1'}})).json().sessionId;
    const run=await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question:'昨天华东支付金额'}});await entered;
    const response=await app.inject({method:'DELETE',url:`/api/sessions/${sid}`});assert.equal(response.statusCode,204,response.body);
    assert.equal((await app.inject(`/api/runs/${run.json().runId}`)).statusCode,404);
    assert.equal((await db.admin.query('SELECT count(*) FROM app.sessions WHERE session_id=$1',[sid])).rows[0].count,'0');
  }finally{await app.close();}
});
test('tool cache reuses evidence but every attempt consumes budget; signal filters can narrow and cannot expand',async()=>{
  let calls=0;
  class Counted extends AnalyticsService {override async analyze(...args:Parameters<AnalyticsService['analyze']>){calls++;return super.analyze(...args);}}
  const tools=new PaymentTools(new Counted(db.reader),query,{storeId:'store-demo',datasetVersion:'signals-v1'},
    {version:'signals-v1',storeName:'模拟',synthetic:true,businessClock:'2026-10-22',updatedAt:new Date().toISOString(),timezone:'Asia/Shanghai'},'cache-run','cache-session','昨天支付金额','deterministic',null,new RunBudget(new AbortController().signal),{phase:async()=>{},event:async()=>{},saveEvidence:async()=>{}},new SignalService(db.reader));
  const first=await tools.execute('compare_metric',{...query,groupBy:'none'}),second=await tools.execute('compare_metric',{...query,groupBy:'none'});
  assert.equal(first.evidenceId,second.evidenceId);assert.equal(calls,1);assert.equal(tools.budget.usage.toolCalls,2);
  await tools.execute('inspect_signals',{signalType:'inventory',query:{...query,filters:{regionId:['east'],skuId:['A']}}});
  await assert.rejects(()=>tools.execute('inspect_signals',{signalType:'inventory',query:{...query,filters:{}}}),/只允许缩小/);
});
test('SKU exclusion does not silently truncate an authorized catalog beyond 20 values',async()=>{
  const data=generateSeed(987,100);await publishSeed(db.admin,data);
  const result=await new AnalyticsService(db.reader).excludeSku(query,'SKU-01',{storeId:'store-demo',datasetVersion:data.version});assert.equal(result,null);
});
test('runner starts only two concurrent analyses, limits queue to ten, and closes queued jobs safely',async()=>{
  let entered=0;
  class Held extends AnalyticsService {override async analyze(...args:Parameters<AnalyticsService['analyze']>){entered++;await delay(10000,undefined,{signal:args[2]});return super.analyze(...args);}}
  const app=await buildApp({statePool:db.state,readerPool:db.reader,analytics:new Held(db.reader)});
  try{
    for(let n=0;n<13;n++){
      const sid=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:'signals-v1'}})).json().sessionId;
      const response=await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'Idempotency-Key':`queue-${n}`},payload:{question:'昨天支付金额'}});
      assert.equal(response.statusCode,n<12?202:429,response.body);
    }
    assert.equal(entered,2);
  }finally{await app.close();}
  assert.equal((await db.admin.query("SELECT count(*) FROM app.runs WHERE status IN ('queued','running')")).rows[0].count,'0');
});
test('Top-N other remainder survives evidence hash validation and report persistence',async()=>{
  const data=generateSeed(1234,1000);await publishSeed(db.admin,data);
  const app=await buildApp({statePool:db.state,readerPool:db.reader});
  try{
    const session=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:data.version}})).json().sessionId;
    const spec={...query,currentWindow:{startDate:'2026-09-21',endDateExclusive:'2026-10-22'},baselineWindow:{startDate:'2026-08-21',endDateExclusive:'2026-09-21'},filters:{},topN:3};
    const id=(await app.inject({method:'POST',url:`/api/sessions/${session}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question:'比较完整窗口',confirmedIntent:spec}})).json().runId;
    let done=false;
    for(let n=0;n<200;n++){const run=(await app.inject(`/api/runs/${id}`)).json();if(!['queued','running'].includes(run.status)){
      assert.equal(run.status,'completed',run.message);const report=(await app.inject(`/api/reports/${run.reportId}`)).json();
      assert.equal(report.contributors.length,4);assert.equal(report.contributors.at(-1).isOther,true);
      assert.equal(report.contributors.reduce((s:number,r:{delta:number})=>s+r.delta,0),report.comparison.delta);done=true;break;}await delay(10);}
    assert.equal(done,true);
  }finally{await app.close();}
});
