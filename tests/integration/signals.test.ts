import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { signalSeed,acceptanceSeed,publishSeed } from '../../db/seeds/generate.js';
import { SignalService } from '../../packages/analytics/src/signals.js';
import { defaultWindows } from '../../packages/metrics/src/index.js';
import { buildApp } from '../../apps/api/src/app.js';
import type { MetricId } from '../../packages/contracts/src/index.js';
import { Value } from 'typebox/value';
import { ReportSchema } from '../../packages/contracts/src/http.js';

let db:Awaited<ReturnType<typeof startLocalPostgres>>,signals:SignalService,app:Awaited<ReturnType<typeof buildApp>>;
const query={metricId:'paid_amount' as MetricId,...defaultWindows('2026-10-22'),filters:{regionId:['east'],skuId:['A']},groupBy:'sku' as const};
const ctx={storeId:'store-demo',datasetVersion:'signals-v1'};
before(async()=>{db=await startLocalPostgres();signals=new SignalService(db.reader);await publishSeed(db.admin,signalSeed());app=await buildApp({statePool:db.state,readerPool:db.reader});await app.ready();},{timeout:60000});
after(async()=>{await app?.close();await db?.stop();});
test('inventory counts observed pool-hours, zeros and partial coverage exactly',async()=>{
  const result=await signals.inspect(query,'inventory',ctx);assert.equal(result.status,'success');
  assert.deepEqual(result.signal,{type:'inventory',current:{expectedHours:24,observedHours:24,zeroHours:10,coverage:1},baseline:{expectedHours:24,observedHours:24,zeroHours:0,coverage:1}});
  const partial=signalSeed('stock-partial');partial.inventory=partial.inventory!.filter(r=>!(r.sku==='A'&&r.region==='east'&&r.at.startsWith('2026-10-21T09')));await publishSeed(db.admin,partial);
  const missing=await signals.inspect(query,'inventory',{...ctx,datasetVersion:partial.version});assert.equal(missing.coverage,23/24);assert.equal(missing.signal?.type,'inventory');
  if(missing.signal?.type==='inventory')assert.equal(missing.signal.current.zeroHours,9);
});
test('traffic is channel-region background only and mismatched attribution suppresses conversion',async()=>{
  const result=await signals.inspect({...query,filters:{...query.filters,channelId:['douyin']}},'traffic',ctx);
  assert.deepEqual(result.signal,{type:'traffic',current:{sessions:700,paidOrders:1,conversion:1/700},baseline:{sessions:1000,paidOrders:1,conversion:0.001},attributionMatched:true,skuAttributionSupported:false});
  const mismatch=signalSeed('traffic-mismatch');mismatch.traffic!.forEach(r=>{r.attribution='incompatible';});await publishSeed(db.admin,mismatch);
  const signal=(await signals.inspect(query,'traffic',{...ctx,datasetVersion:mismatch.version})).signal;
  assert.ok(signal?.type==='traffic');assert.equal(signal.current.conversion,null);assert.equal(signal.attributionMatched,false);
});
test('refund reasons follow succeeded_at, count partial events and retain unknown code',async()=>{
  const result=await signals.inspect({...query,metricId:'refund_amount'},'refund_reason',ctx);
  assert.deepEqual(result.signal,{type:'refund_reason',reasons:[{code:'damaged',amountCents:100000,events:1},{code:'unknown',amountCents:200000,events:1}],missingShare:2/3});
});
test('promotion matching handles all-scope NULL values without multiplying sales',async()=>{
  const result=await signals.inspect(query,'promotion',ctx);assert.equal(result.rows.length,1);
  assert.equal((await signals.inspect({...query,filters:{skuId:['B']}},'promotion',ctx)).rows.length,0);
  const data=signalSeed('promotion-global');data.promotions!.push({...data.promotions![0]!,id:'global',channel:null,sku:null});await publishSeed(db.admin,data);
  assert.equal((await signals.inspect(query,'promotion',{...ctx,datasetVersion:data.version})).rows.length,2);
});
test('signal datasets are immutable and isolated by store/version',async()=>{
  assert.equal((await signals.inspect(query,'inventory',{...ctx,storeId:'store-other'})).coverage,null);
  await assert.rejects(()=>db.admin.query("UPDATE business.inventory_hourly SET available_units=9 WHERE dataset_version='signals-v1'"),/immutable/);
  await assert.rejects(()=>db.state.query('SELECT * FROM business.traffic_daily'),/permission denied/);
});
test('three primary metrics each complete full HTTP report with correct units and source-specific facts',async()=>{
  for(const [metric,current,baseline,unit]of [['paid_amount',7000000,10000000,'fen'],['refund_amount',300000,0,'fen'],['sold_units',70,100,'units']]as const){
    const session=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:'signals-v1'}})).json().sessionId;
    const request=await app.inject({method:'POST',url:`/api/sessions/${session}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question:`昨天${metric}`,confirmedIntent:{...query,metricId:metric,filters:{regionId:['east']}}}});
    assert.equal(request.statusCode,202,request.body);const id=request.json().runId;
    let reportId:string|undefined;
    for(let n=0;n<200;n++){const run=(await app.inject(`/api/runs/${id}`)).json();if(!['queued','running'].includes(run.status)){assert.equal(run.status,'completed',run.message);reportId=run.reportId;break;}await delay(10);}
    const response=await app.inject(`/api/reports/${reportId}`),report=response.json();assert.equal(response.statusCode,200,response.body);assert.ok(Value.Check(ReportSchema,report));
    assert.equal(report.unit,unit);assert.equal(report.comparison.current,current);assert.equal(report.comparison.baseline,baseline);
    assert.equal(report.provenance.contractVersion,'1.1.0');
    if(metric==='paid_amount'){assert.ok(report.hypotheses.some(h=>h.text.includes('供应约束')));assert.ok(report.facts.some(f=>f.templateId==='signal'));}
    if(metric==='refund_amount'){assert.equal(report.comparison.changeRate,null);assert.ok(report.evidences.some(e=>e.kind==='refund_reason'));assert.match(report.unknowns.join(' '),/质量事故/);}
    if(metric==='sold_units')assert.match(report.facts[0]!.text,/70 件/);
  }
});
