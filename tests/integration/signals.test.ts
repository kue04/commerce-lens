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
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { PaymentTools } from '../../packages/agent/src/tools.js';
import { RunBudget } from '../../packages/agent/src/budget.js';

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
    assert.equal(report.provenance.contractVersion,'1.2.0');
    if(metric==='paid_amount'){
      const stock=report.hypotheses.find(h=>h.text.includes('供应约束'));assert.ok(stock);
      assert.deepEqual(stock.evidenceIds.map(id=>report.evidences.find(e=>e.id===id)?.kind).sort(),['comparison','contribution','inventory']);
      assert.ok(report.facts.some(f=>f.templateId==='signal'));
    }
    if(metric==='refund_amount'){assert.equal(report.comparison.changeRate,null);assert.ok(report.evidences.some(e=>e.kind==='refund_reason'));assert.match(report.unknowns.join(' '),/质量事故/);}
    if(metric==='sold_units')assert.match(report.facts[0]!.text,/70 件/);
  }
});
test('real SQL stock pools keep growing-SKU zeros out of a declining-SKU explanation',async()=>{
  const data=signalSeed('stock-growing-sku');
  for(const row of data.inventory!){
    row.units=row.at.startsWith('2026-10-21') && row.region==='east' && row.sku==='B' && Number(row.at.slice(11,13))<10?0:100;
  }
  await publishSeed(db.admin,data);
  // Independent SQL and hand expectation: only the growing B has ten zero hours.
  const counts=(await db.admin.query(`SELECT sku_id,COUNT(*) FILTER(WHERE available_units=0 AND is_observed)::int AS zeros
    FROM business.inventory_hourly WHERE dataset_version=$1 AND store_id=$2 AND region_id='east'
    AND hour_at>='2026-10-21T00:00:00+08:00' AND hour_at<'2026-10-22T00:00:00+08:00' AND sku_id IN ('A','B')
    GROUP BY sku_id ORDER BY sku_id`,[data.version,'store-demo'])).rows;
  assert.deepEqual(counts,[{sku_id:'A',zeros:0},{sku_id:'B',zeros:10}]);
  const spec={...query,filters:{regionId:['east']}};
  const tools=new PaymentTools(new AnalyticsService(db.reader),spec,{...ctx,datasetVersion:data.version},
    {version:data.version,storeName:'模拟',synthetic:true,businessClock:data.clock,updatedAt:'2026-10-22T00:00:00+08:00',timezone:'Asia/Shanghai'},
    randomUUID(),randomUUID(),'昨天华东支付金额','deterministic',null,new RunBudget(new AbortController().signal),
    {phase:async()=>{},event:async()=>{},saveEvidence:async()=>{}},signals);
  await tools.execute('compare_metric',{...spec,groupBy:'none'});
  await tools.execute('decompose_change',spec);
  for(const skuId of [['A'],['B'],['A','B']])await tools.execute('inspect_signals',{signalType:'inventory',query:{...spec,filters:{...spec.filters,skuId}}});
  const comparison=tools.evidences.find(e=>e.kind==='comparison')!,contribution=tools.evidences.find(e=>e.kind==='contribution')!;
  assert.equal(comparison.comparison!.delta,-3000000);
  assert.equal(contribution.contributors!.find(c=>c.key==='A')!.delta,-4000000);
  assert.equal(contribution.contributors!.find(c=>c.key==='B')!.delta,1000000);
  for(const inventory of tools.evidences.filter(e=>e.kind==='inventory')){
    await tools.execute('submit_report',{comparisonEvidenceId:comparison.id,contributionEvidenceId:contribution.id,signalEvidenceIds:[inventory.id]});
    const report=tools.render();
    assert.equal(report.hypotheses.length,0,'A has no zeros, B grew, and the combined pool cannot locate the zeros');
    assert.ok(report.facts.some(f=>f.evidenceIds.includes(inventory.id)));
    if(inventory.query.filters.skuId!.length>1)assert.match(report.unknowns.join(' '),/单个下降 SKU/);
  }
});
