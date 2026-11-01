import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Value } from 'typebox/value';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { buildApp } from '../../apps/api/src/app.js';
import { acceptanceSeed,publishSeed,type SeedData } from '../../db/seeds/generate.js';
import { portfolioSeed,PORTFOLIO_VERSION } from '../../db/seeds/portfolio.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { changeRule } from '../../packages/analytics/src/rules.js';
import { OverviewSchema,type OverviewDTO } from '../../packages/contracts/src/http.js';
import type { QuerySpec } from '../../packages/contracts/src/index.js';
import { shiftDate,utcWindow } from '../../packages/metrics/src/index.js';

let db:Awaited<ReturnType<typeof startLocalPostgres>>,app:Awaited<ReturnType<typeof buildApp>>,analytics:AnalyticsService;
const query=(days=1,metricId:QuerySpec['metricId']='paid_amount'):QuerySpec=>{
  const currentWindow={startDate:shiftDate('2026-10-22',-days),endDateExclusive:'2026-10-22'},offset=days===1?7:days;
  return {metricId,currentWindow,baselineWindow:{startDate:shiftDate(currentWindow.startDate,-offset),endDateExclusive:shiftDate('2026-10-22',-offset)},filters:{},groupBy:'sku',topN:10};
};
before(async()=>{
  db=await startLocalPostgres();analytics=new AnalyticsService(db.reader);
  await publishSeed(db.admin,acceptanceSeed());await publishSeed(db.admin,portfolioSeed());
  const gap=acceptanceSeed('overview-gap');gap.sourceOverrides={refund_events:{missing:['2026-10-21']}};await publishSeed(db.admin,gap);
  const absent=acceptanceSeed('overview-absent');absent.sourceOverrides={order_items:{missing:['2026-10-14']}};await publishSeed(db.admin,absent);
  const noRefundVersion='overview-no-refund-source';
  // Source absence is built before publication, never by editing a published dataset.
  const client=await db.admin.connect();
  try{
    await client.query('BEGIN');
    // publishSeed cannot omit a mandatory source; create this minimal valid draft explicitly.
    await client.query("INSERT INTO business.datasets(dataset_version,schema_version,seed,business_clock,is_synthetic) VALUES($1,'1.1.0',42,'2026-10-22',true)",[noRefundVersion]);
    await client.query("INSERT INTO business.products VALUES($1,'store-demo','A','商品A','零食')",[noRefundVersion]);
    await client.query("INSERT INTO business.source_watermarks(dataset_version,store_id,source,coverage_start,complete_through,checked_at) SELECT $1,'store-demo',source,'2026-07-24','2026-10-22',now() FROM unnest(ARRAY['orders','order_items']) AS source",[noRefundVersion]);
    await client.query("UPDATE business.datasets SET status='published',published_at=now() WHERE dataset_version=$1",[noRefundVersion]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const cap:SeedData={version:'overview-cap',seed:42,clock:'2026-10-22',start:'2026-07-24',completeThrough:'2026-10-22',missing:[],products:[],orders:[],items:[],refunds:[]};
  for(const sku of ['A','B','C','D','E','F'])cap.products.push({store:'store-demo',sku,name:sku,category:'零食'});
  for(const [id,date,amount,quantity] of [['base','2026-10-14',100000,10],['current','2026-10-21',50000,5]] as const){
    cap.orders.push({store:'store-demo',id,at:`${date}T12:00:00+08:00`,status:'succeeded',channel:'douyin',region:'east',amount:amount*6});
    for(const p of cap.products)cap.items.push({store:'store-demo',id:`${id}-${p.sku}`,order:id,sku:p.sku,category:p.category,quantity,amount});
  }
  await publishSeed(db.admin,cap);
  app=await buildApp({statePool:db.state,readerPool:db.reader,mode:'deterministic',defaultDataset:PORTFOLIO_VERSION});
},{timeout:60000});
after(async()=>{await app?.close();await db?.stop();});
async function overview(spec=query(),version='acceptance-v1',api=app):Promise<OverviewDTO>{
  const response=await api.inject({method:'POST',url:`/api/datasets/${version}/overview`,payload:spec});
  assert.equal(response.statusCode,200,response.body);const body=response.json<OverviewDTO>();assert.ok(Value.Check(OverviewSchema,body));return body;
}

test('manual totals, contributions, same-rule hints and single-day analysis scope match without creating runs',async()=>{
  const result=await overview();
  assert.deepEqual(result.metrics.map(m=>[m.metricId,m.comparison.current,m.comparison.baseline]),[['paid_amount',7000000,10000000],['refund_amount',300000,0],['sold_units',70,100]]);
  assert.deepEqual(result.contributors.map(r=>[r.key,r.delta]),[['A',-4000000],['B',1000000]]);
  assert.equal(result.changes.length,2);assert.ok(result.changes.every(c=>changeRule('paid_amount',c.comparison)));
  const last=result.trend.points.at(-1)!;assert.equal(last.date,'2026-10-21');assert.equal(last.baselineDate,'2026-10-14');assert.equal(last.comparison.current,7000000);
  assert.equal(result.trend.points.length,30);assert.deepEqual(result.trend.currentWindow,{startDate:'2026-09-22',endDateExclusive:'2026-10-22'});
  const day=await analytics.analyze(last.analysisQuery,{datasetVersion:'acceptance-v1',storeId:'store-demo'});assert.deepEqual(day.comparison,last.comparison);
  assert.equal(result.agentExecuted,false);assert.equal(result.executionMode,'deterministic');
  assert.equal((await db.admin.query('SELECT count(*) FROM app.runs')).rows[0].count,'0');
  assert.equal((await db.admin.query('SELECT count(*) FROM app.reports')).rows[0].count,'0');
});

test('fixed bounded daily template matches independent SQL for all 30 days, card windows and filtered contributions',{timeout:60000},async()=>{
  const sql=await readFile(new URL('../../evals/oracles/aggregate.sql',import.meta.url),'utf8');
  for(const days of [1,7,30]){
    const spec=query(days),result=await overview(spec,PORTFOLIO_VERSION);
    const refundTrend=await overview(query(days,'refund_amount'),PORTFOLIO_VERSION),unitsTrend=await overview(query(days,'sold_units'),PORTFOLIO_VERSION);
    assert.deepEqual(result.query.currentWindow,spec.currentWindow);assert.deepEqual(result.query.baselineWindow,spec.baselineWindow);assert.equal(result.trend.offsetDays,days===1?7:days);
    for(const [period,window] of [['current',spec.currentWindow],['baseline',spec.baselineWindow]] as const){
      const oracle=(await db.admin.query(sql,[PORTFOLIO_VERSION,'store-demo',...utcWindow(window)])).rows[0];
      for(const card of result.metrics)assert.equal(card.comparison[period],Number(oracle[card.metricId==='paid_amount'?'paid':card.metricId==='sold_units'?'units':'refund']));
    }
    for(const point of result.trend.points){
      const oracle=(await db.admin.query(sql,[PORTFOLIO_VERSION,'store-demo',...utcWindow(point.analysisQuery.currentWindow)])).rows[0];
      const baseline=(await db.admin.query(sql,[PORTFOLIO_VERSION,'store-demo',...utcWindow(point.analysisQuery.baselineWindow)])).rows[0];
      assert.equal(point.comparison.current,Number(oracle.paid));assert.equal(point.comparison.baseline,Number(baseline.paid));
      const index=result.trend.points.indexOf(point);
      for(const [trend,column] of [[refundTrend,'refund'],[unitsTrend,'units']] as const){
        assert.equal(trend.trend.points[index]!.comparison.current,Number(oracle[column]));assert.equal(trend.trend.points[index]!.comparison.baseline,Number(baseline[column]));
      }
    }
    assert.ok(result.queryTemplateIds.length<=2);
    const rows=await analytics.analyze(spec,{storeId:'store-demo',datasetVersion:PORTFOLIO_VERSION});
    assert.deepEqual(result.contributors,rows.contributors.map(r=>({...r,label:r.key})));
    assert.equal(result.contributors.reduce((sum,r)=>sum+r.delta!,0),result.metrics[0]!.comparison.delta);
    for(const metricId of ['refund_amount','sold_units'] as const){
      const filtered={...spec,metricId,filters:{skuId:['SKU-01','SKU-03'],regionId:['east'],channelId:['douyin']}};
      const sliced=await overview(filtered,PORTFOLIO_VERSION),direct=await analytics.analyze(filtered,{storeId:'store-demo',datasetVersion:PORTFOLIO_VERSION});
      assert.deepEqual(sliced.metrics.find(m=>m.metricId===metricId)!.comparison,direct.comparison);
      for(const n of [0,14,29]){const point=sliced.trend.points[n]!;const analyzed=await analytics.analyze(point.analysisQuery,{storeId:'store-demo',datasetVersion:PORTFOLIO_VERSION});assert.deepEqual(point.comparison,analyzed.comparison);}
    }
  }
});

test('missing source and partition isolate each metric; missing days stay null with reasons and real zeros stay zero',async()=>{
  const gap=await overview(query(1,'refund_amount'),'overview-gap');
  assert.equal(gap.metrics[0]!.availability.available,true);assert.equal(gap.metrics[2]!.availability.available,true);
  assert.equal(gap.availability.available,false);assert.equal(gap.metrics[1]!.comparison.current,null);assert.equal(gap.metrics[1]!.comparison.baseline,0);
  assert.match(gap.availability.reason!,/refund_events/);assert.deepEqual(gap.changes,[]);assert.deepEqual(gap.contributors,[]);
  const point=gap.trend.points.at(-1)!;assert.equal(point.comparison.current,null);assert.equal(point.comparison.baseline,0);assert.equal(point.comparison.delta,null);assert.match(point.currentAvailability.reason!,/refund_events/);
  const previous=gap.trend.points.at(-2)!;assert.equal(previous.comparison.current,0);assert.equal(previous.currentAvailability.available,true);
  const absent=await overview(query(),'overview-no-refund-source');
  assert.equal(absent.metrics[0]!.comparison.current,0);assert.equal(absent.metrics[0]!.availability.available,true);assert.equal(absent.metrics[1]!.comparison.current,null);assert.equal(absent.metrics[1]!.availability.available,false);
  const missingPayment=await overview(query(),'overview-absent');assert.equal(missingPayment.metrics[0]!.comparison.baseline,null);assert.equal(missingPayment.metrics[0]!.comparison.current,7000000);
  const refund=await overview(query(1,'refund_amount'));assert.equal(refund.metrics[1]!.comparison.changeRate,null);assert.equal(refund.availability.available,true);
  const empty=await overview({...query(),filters:{regionId:['west']}});assert.equal(empty.metrics[0]!.comparison.current,0);assert.equal(empty.metrics[0]!.comparison.baseline,0);assert.equal(empty.metrics[0]!.comparison.changeRate,null);
});

test('HTTP rejects version/scope injection, invalid comparison windows and unsupported metrics; RLS holds',async()=>{
  for(const payload of [{...query(),storeId:'store-other'},{...query(),datasetVersion:'x'},{...query(),sql:'SELECT 1'},query(2),{...query(7),baselineWindow:query().baselineWindow},query(1,'aov'),{...query(),filters:{skuId:['unknown']}}]){
    const response=await app.inject({method:'POST',url:'/api/datasets/acceptance-v1/overview',payload});assert.ok([400,422].includes(response.statusCode),response.body);
  }
  const other=await buildApp({statePool:db.state,readerPool:db.reader,identity:{ownerId:'other-owner',storeId:'store-other'},recover:false});
  try{const result=await overview(query(),'acceptance-v1',other);assert.equal(result.metrics[0]!.comparison.current,800000000);const forbidden=await other.inject({method:'POST',url:`/api/datasets/${PORTFOLIO_VERSION}/overview`,payload:query()});assert.equal(forbidden.statusCode,422);}finally{await other.close();}
  assert.equal((await db.reader.query('SELECT count(*) FROM business.orders')).rows[0].count,'0');
});

test('same QuerySpec produces identical persisted report and overview values; rule changes are bounded to five',async()=>{
  for(const [version,days] of [['acceptance-v1',1],[PORTFOLIO_VERSION,30]] as const)for(const metricId of ['paid_amount','refund_amount','sold_units'] as const){
    const spec=query(days,metricId),result=await overview(spec,version);
    const sid=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:version}})).json().sessionId;
    const start=await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'Idempotency-Key':`overview-${version}-${metricId}`},payload:{question:'按确认范围分析',confirmedIntent:spec}});assert.equal(start.statusCode,202,start.body);
    let reportId:string|undefined;for(let n=0;n<300;n++){const run=(await app.inject(`/api/runs/${start.json().runId}`)).json();if(run.reportId){reportId=run.reportId;break;}await delay(10);}assert.ok(reportId);
    const report=(await app.inject(`/api/reports/${reportId}`)).json();assert.deepEqual(report.comparison,result.metrics.find(m=>m.metricId===metricId)!.comparison);assert.deepEqual(report.contributors,result.contributors);
    assert.equal(report.finding.includes('未达到'),!changeRule(metricId,report.comparison));assert.equal(report.provenance.agentExecuted,false);
  }
  const many=await overview(query(),'overview-cap');assert.equal(many.changes.length,5);assert.deepEqual(many.changes.slice(1).map(c=>c.contributor!.key),['A','B','C','D']);
  for(const change of many.changes){const actual=await analytics.analyze(change.analysisQuery,{storeId:'store-demo',datasetVersion:'overview-cap'});assert.deepEqual(actual.comparison,change.comparison);}
  const category=await overview({...query(),groupBy:'category'},'overview-cap');assert.equal(category.contributors.length,1);assert.equal(category.changes.length,1);
});

test('real HTTP overview has a bounded number of SQL templates and never needs a model even when API mode is agent',async()=>{
  let modelCalls=0;
  const runtime={analyze:async()=>{modelCalls++;throw new Error('No model calls allowed');},interpret:async()=>{modelCalls++;throw new Error('No model calls allowed');}};
  const agentApp=await buildApp({statePool:db.state,readerPool:db.reader,mode:'agent',runtime:runtime as never,recover:false});
  const before=(await db.admin.query('SELECT count(*) FROM app.runs')).rows[0].count;
  try{
    const base=await agentApp.listen({host:'127.0.0.1',port:0});
    const response=await fetch(`${base}/api/datasets/${PORTFOLIO_VERSION}/overview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query(30)),signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);const result=await response.json() as OverviewDTO;assert.ok(Value.Check(OverviewSchema,result));assert.equal(result.executionMode,'deterministic');assert.equal(result.agentExecuted,false);
    assert.equal(modelCalls,0);assert.equal((await db.admin.query('SELECT count(*) FROM app.runs')).rows[0].count,before);
  }finally{await agentApp.close();}
  // Inspect actual query calls in the service, not only reported template IDs.
  const client=await db.reader.connect(),originalQuery=client.query.bind(client);let daily=0,aggregate=0;
  client.query=((...args:any[])=>{const text=typeof args[0]==='string'?args[0]:args[0].text;if(text.includes('WITH daily AS'))daily++;if(text.includes('WITH windows('))aggregate++;return (originalQuery as any)(...args);}) as typeof client.query;
  const proxy={connect:async()=>client} as unknown as typeof db.reader;
  try{const actual=new AnalyticsService(proxy);await actual.overviewData(query(30),{datasetVersion:PORTFOLIO_VERSION,storeId:'store-demo'});assert.equal(daily,1);assert.equal(aggregate,1);}finally{client.query=originalQuery;}
});
