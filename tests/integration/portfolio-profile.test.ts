import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Value } from 'typebox/value';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { buildApp } from '../../apps/api/src/app.js';
import { Repository,emptyUsage } from '../../apps/api/src/repository.js';
import { portfolioSeed,PORTFOLIO_VERSION } from '../../db/seeds/portfolio.js';
import { acceptanceSeed,publishSeed } from '../../db/seeds/generate.js';
import { DatasetProfileSchema,ReportSchema,type DatasetProfileDTO,type ReportDTO } from '../../packages/contracts/src/http.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { DatasetProfileService } from '../../packages/analytics/src/profile.js';
import { shiftDate,utcWindow } from '../../packages/metrics/src/index.js';

let db:Awaited<ReturnType<typeof startLocalPostgres>>,app:Awaited<ReturnType<typeof buildApp>>,service:AnalyticsService;
let seedHash:string,publishedAfter:string;
const hash=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
const context={storeId:'store-demo',datasetVersion:PORTFOLIO_VERSION};
before(async()=>{
  db=await startLocalPostgres();service=new AnalyticsService(db.reader);
  await publishSeed(db.admin,acceptanceSeed());
  const seed=portfolioSeed();seedHash=hash(seed);publishedAfter=new Date().toISOString();await publishSeed(db.admin,seed);
  app=await buildApp({statePool:db.state,readerPool:db.reader,mode:'deterministic',defaultDataset:PORTFOLIO_VERSION});
},{timeout:60000});
after(async()=>{await app?.close();await db?.stop();});

test('fixed portfolio is reproducible; duplicate publication and fact edits are rejected',async()=>{
  const again=portfolioSeed();assert.equal(hash(again),seedHash);
  await assert.rejects(()=>publishSeed(db.admin,again),/already exists/);
  await assert.rejects(()=>db.admin.query('DELETE FROM business.inventory_hourly WHERE dataset_version=$1',[PORTFOLIO_VERSION]),/immutable/);
  assert.deepEqual((await db.admin.query('SELECT dataset_version FROM business.datasets ORDER BY dataset_version')).rows.map(r=>r.dataset_version),['acceptance-v1',PORTFOLIO_VERSION]);
});

test('HTTP profile counts actual scoped rows and separates publication, clock and coverage',async()=>{
  const response=await app.inject(`/api/datasets/${PORTFOLIO_VERSION}/profile`);assert.equal(response.statusCode,200,response.body);
  const profile=response.json<DatasetProfileDTO>();assert.ok(Value.Check(DatasetProfileSchema,profile));
  assert.equal(profile.contractVersion,'1.2.0');assert.equal(profile.dataset.businessClock,'2026-10-22');
  assert.ok(profile.publishedAt>=publishedAfter);assert.notEqual(profile.publishedAt,'2026-10-21T16:00:00.000Z');
  assert.equal(profile.dataset.updatedAt,profile.publishedAt);assert.equal(profile.completeThrough,'2026-10-22');assert.equal(profile.lastCompleteDate,'2026-10-21');
  assert.deepEqual({...profile.counts,refundEvents:0},{orders:100000,orderItems:200000,refundEvents:0,inventoryHours:259200,trafficDays:1080,promotionEvents:2,skus:30,channels:3,regions:4});
  const actual=(await db.admin.query('SELECT count(*)::int AS count FROM business.refund_events WHERE dataset_version=$1 AND store_id=$2',[PORTFOLIO_VERSION,'store-demo'])).rows[0].count;
  assert.equal(profile.counts.refundEvents,actual);assert.ok(actual>0);
  for(const source of profile.sources){assert.equal(source.status,'available');assert.deepEqual(source.missingPartitions,[]);assert.ok(source.checkedAt!>=publishedAfter);}
  for(const source of profile.sources.filter(s=>s.source!=='promotion')){assert.equal(source.actualStartDate,'2026-07-24',source.source);assert.equal(source.actualEndDate,'2026-10-21',source.source);}
  assert.equal(profile.filters.skuId.length,30);assert.deepEqual(profile.filters.channelId.map(r=>r.value),['douyin','jd','tmall']);
  assert.equal(profile.metrics.find(m=>m.metricId==='refund_amount')!.timeField,'succeeded_at');
  assert.equal((await db.admin.query('SELECT count(*) FROM app.runs')).rows[0].count,'0');
});

test('all ninety days have correct inventory and traffic grain, and real refunds are continuous and cross-period',async()=>{
  const daily=(await db.admin.query(`SELECT business_date::text AS date,count(*)::int AS count FROM business.traffic_daily WHERE dataset_version=$1 GROUP BY business_date ORDER BY business_date`,[PORTFOLIO_VERSION])).rows;
  assert.equal(daily.length,90);assert.ok(daily.every((r,n)=>r.date===shiftDate('2026-07-24',n)&&r.count===12));
  const hourly=(await db.admin.query(`SELECT (hour_at AT TIME ZONE 'Asia/Shanghai')::date::text AS date,count(*)::int AS count FROM business.inventory_hourly WHERE dataset_version=$1 GROUP BY 1 ORDER BY 1`,[PORTFOLIO_VERSION])).rows;
  assert.equal(hourly.length,90);assert.ok(hourly.every(r=>r.count===30*4*24));
  const refunds=(await db.admin.query(`SELECT count(DISTINCT (r.succeeded_at AT TIME ZONE 'Asia/Shanghai')::date)::int AS days,
    count(*) FILTER(WHERE (r.succeeded_at AT TIME ZONE 'Asia/Shanghai')::date>(o.paid_at AT TIME ZONE 'Asia/Shanghai')::date)::int AS cross_period
    FROM business.refund_events r JOIN business.order_items i USING(dataset_version,store_id,order_item_id) JOIN business.orders o USING(dataset_version,store_id,order_id) WHERE r.dataset_version=$1`,[PORTFOLIO_VERSION])).rows[0];
  assert.equal(refunds.days,90);assert.ok(refunds.cross_period>0);
  const invalid=(await db.admin.query(`SELECT count(*)::int AS count FROM business.traffic_daily t JOIN (
    SELECT dataset_version,store_id,channel_id,region_id,(paid_at AT TIME ZONE 'Asia/Shanghai')::date AS business_date,count(*) AS paid FROM business.orders WHERE dataset_version=$1 AND payment_status='succeeded' GROUP BY 1,2,3,4,5
    ) o USING(dataset_version,store_id,channel_id,region_id,business_date) WHERE o.paid>t.sessions`,[PORTFOLIO_VERSION])).rows[0];
  assert.equal(invalid.count,0);
});

test('portfolio three metrics match independent SQL oracle for yesterday, seven and thirty days with conserved contributions',async()=>{
  const oracle=await readFile(new URL('../../evals/oracles/aggregate.sql',import.meta.url),'utf8');
  for(const days of [1,7,30]){
    const currentWindow={startDate:shiftDate('2026-10-22',-days),endDateExclusive:'2026-10-22'};
    const offset=days===1?7:days,baselineWindow={startDate:shiftDate(currentWindow.startDate,-offset),endDateExclusive:shiftDate(currentWindow.endDateExclusive,-offset)};
    const expected=await Promise.all([currentWindow,baselineWindow].map(w=>db.admin.query(oracle,[PORTFOLIO_VERSION,'store-demo',...utcWindow(w)])));
    for(const [metricId,column] of [['paid_amount','paid'],['sold_units','units'],['refund_amount','refund']] as const){
      const actual=await service.analyze({metricId,currentWindow,baselineWindow,filters:{},groupBy:'sku',topN:5},context);
      assert.equal(actual.comparison.current,Number(expected[0]!.rows[0][column]));assert.equal(actual.comparison.baseline,Number(expected[1]!.rows[0][column]));
      assert.equal(actual.contributors.reduce((sum,r)=>sum+r.delta!,0),actual.comparison.delta);
    }
  }
});

test('small profile uses real counts, missing partitions and absent sources retain meanings; RLS never leaks another store',async()=>{
  const profileService=new DatasetProfileService(db.reader);
  const small=await profileService.profile({...context,datasetVersion:'acceptance-v1'});
  assert.equal(small.counts.orders,4);assert.equal(small.counts.orderItems,6);assert.equal(small.counts.refundEvents,3);
  assert.equal(small.sources.find(s=>s.source==='inventory')!.status,'missing');assert.equal(small.sources.find(s=>s.source==='inventory')!.checkedAt,null);
  assert.equal(small.sources.find(s=>s.source==='orders')!.actualStartDate,'2026-10-14');
  const data=acceptanceSeed('profile-gap');data.sourceOverrides={refund_events:{missing:['2026-10-21']}};await publishSeed(db.admin,data);
  const gap=await profileService.profile({...context,datasetVersion:data.version});assert.equal(gap.completeThrough,'2026-10-21');
  assert.equal(gap.sources.find(s=>s.source==='refund_events')!.status,'partial');assert.equal(gap.sources.find(s=>s.source==='orders')!.status,'available');
  assert.equal(gap.sources.find(s=>s.source==='refund_events')!.lastCompleteDate,'2026-10-20');
  const zero=acceptanceSeed('profile-zero');zero.refunds=[];await publishSeed(db.admin,zero);
  const zeroProfile=await profileService.profile({...context,datasetVersion:zero.version});
  assert.equal(zeroProfile.counts.refundEvents,0);assert.equal(zeroProfile.sources.find(s=>s.source==='refund_events')!.status,'available');
  assert.equal(zeroProfile.sources.find(s=>s.source==='refund_events')!.actualStartDate,null);
  const other=await buildApp({statePool:db.state,readerPool:db.reader,identity:{ownerId:'other-owner',storeId:'store-other'},recover:false});
  try{
    const allowed=await other.inject('/api/datasets/acceptance-v1/profile');assert.equal(allowed.statusCode,200,allowed.body);assert.equal(allowed.json().counts.orders,2);
    assert.equal((await other.inject(`/api/datasets/${PORTFOLIO_VERSION}/profile`)).statusCode,422);
  }finally{await other.close();}
  assert.equal((await app.inject('/api/datasets/unknown/profile')).statusCode,422);
  assert.equal((await app.inject(`/api/datasets/${PORTFOLIO_VERSION}/profile?storeId=store-other`)).statusCode,400);
  assert.equal((await app.inject('/api/datasets/'+encodeURIComponent("'; SELECT 1;--")+'/profile')).statusCode,422);
  assert.equal((await db.reader.query('SELECT count(*) FROM business.orders')).rows[0].count,'0');
});

test('stored legacy reports retain exact JSON and exports under provenance 1.0.0 and 1.1.0',async()=>{
  const {report}=JSON.parse(await readFile(new URL('../../packages/contracts/examples/payment-flow.json',import.meta.url),'utf8'));
  const repo=new Repository(db.state,{ownerId:'local-owner',storeId:'store-demo'});
  for(const version of ['1.0.0','1.1.0'] as const){
    const {sessionId}=await repo.createSession('acceptance-v1');
    const {run}=await repo.createRun(sessionId,{question:report.question},`legacy-${version}`,'deterministic');
    await repo.patch(run.id,{status:'running'});
    const legacy:ReportDTO={...structuredClone(report),id:`legacy-${version}`,runId:run.id,sessionId,provenance:{...report.provenance,contractVersion:version}};
    assert.ok(Value.Check(ReportSchema,legacy));await repo.saveReport(legacy,emptyUsage());
    const original=structuredClone((await db.admin.query('SELECT dto FROM app.reports WHERE report_id=$1',[legacy.id])).rows[0].dto);
    assert.equal((await app.inject(`/api/datasets/${PORTFOLIO_VERSION}/profile`)).statusCode,200);
    const response=await app.inject(`/api/reports/${legacy.id}`);assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json(),original);
    const exported=await app.inject(`/api/reports/${legacy.id}/export?format=json`);assert.equal(exported.statusCode,200);assert.deepEqual(exported.json(),original);
    const md=await app.inject(`/api/reports/${legacy.id}/export?format=md`);assert.equal(md.statusCode,200);assert.ok(md.body.includes(version));
    assert.deepEqual((await db.admin.query('SELECT dto FROM app.reports WHERE report_id=$1',[legacy.id])).rows[0].dto,original);
    await assert.rejects(()=>db.admin.query('UPDATE app.reports SET dto=dto WHERE report_id=$1',[legacy.id]),/immutable/);
  }
});
