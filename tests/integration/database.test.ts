import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { acceptanceSeed,generateSeed,publishSeed } from '../../db/seeds/generate.js';
import { migrate } from '../../db/migrate.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { defaultWindows,utcWindow } from '../../packages/metrics/src/index.js';
import type { MetricId } from '../../packages/contracts/src/index.js';
import { setTimeout as delay } from 'node:timers/promises';

let db:Awaited<ReturnType<typeof startLocalPostgres>>,service:AnalyticsService;
const context={storeId:'store-demo',datasetVersion:'acceptance-v1'};
const query=(metricId:MetricId='paid_amount',groupBy='none')=>({metricId,...defaultWindows('2026-10-22'),filters:{},groupBy});
before(async()=>{
  db=await startLocalPostgres();service=new AnalyticsService(db.reader);
  await publishSeed(db.admin,acceptanceSeed());
},{timeout:60000});
after(async()=>{await db?.stop();});

test('runs on real PostgreSQL 18 and migrations are idempotent',async()=>{
  const version=await db.admin.query('SHOW server_version_num');assert.ok(Number(version.rows[0].server_version_num)>=180000);
  await migrate(db.admin);
  const result=await db.admin.query('SELECT count(*) FROM public.schema_migrations');assert.equal(result.rows[0].count,'4');
});
test('PRD hand-verified payment/units/order/AOV/refund/net amounts match',async()=>{
  const expected:Record<MetricId,[number,number]>={paid_amount:[7000000,10000000],sold_units:[70,100],paid_orders:[1,1],aov:[7000000,10000000],refund_amount:[300000,0],net_receipts:[6700000,10000000]};
  for(const [metric,[current,baseline]]of Object.entries(expected)){
    const result=await service.analyze(query(metric as MetricId),context);
    assert.equal(result.comparison.current,current,metric);assert.equal(result.comparison.baseline,baseline,metric);
    assert.equal(result.evidence.snapshotId,'acceptance-v1');assert.equal(result.evidence.isSynthetic,true);
    assert.match(result.evidence.resultHash,/^[a-f0-9]{64}$/);
  }
});
test('separate independent SQL oracle agrees on both windows and refund join trap is detectable',async()=>{
  const sql=await readFile(new URL('../../evals/oracles/aggregate.sql',import.meta.url),'utf8');
  for(const [period,window] of Object.entries(defaultWindows('2026-10-22'))){
    const oracle=(await db.admin.query(sql,['acceptance-v1','store-demo',...utcWindow(window)])).rows[0];
    const target=period==='currentWindow'?'current':'baseline';
    for(const [metric,column]of [['paid_amount','paid'],['paid_orders','orders'],['sold_units','units'],['refund_amount','refund']] as const){
      const result=await service.analyze(query(metric),context);assert.equal(result.comparison[target],Number(oracle[column]));
    }
  }
  const wrong=await db.admin.query(`SELECT SUM(i.paid_amount_cents)::text AS paid FROM business.orders o JOIN business.order_items i USING(dataset_version,store_id,order_id)
    LEFT JOIN business.refund_events r USING(dataset_version,store_id,order_item_id)
    WHERE o.dataset_version='acceptance-v1' AND o.store_id='store-demo' AND o.order_id='base'`);
  assert.equal(wrong.rows[0].paid,'22000000'); // A repeated 3 times: test would detect this incorrect implementation.
});
test('contributions are conserved, offsetting signs and category snapshots are retained',async()=>{
  const result=await service.analyze({...query('paid_amount','sku'),topN:1},context);
  assert.equal(result.contributors.length,2);assert.equal(result.contributors[0]!.key,'A');
  assert.equal(result.contributors[0]!.delta,-4000000);assert.equal(result.contributors[0]!.share,4/3);
  assert.equal(result.contributors[1]!.isOther,true);assert.equal(result.contributors[1]!.share,-1/3);
  assert.equal((await service.analyze(query('paid_amount','category'),context)).contributors[0]!.key,'零食');
  await assert.rejects(()=>service.analyze(query('paid_orders','sku'),context),/可加/);
  await assert.rejects(()=>service.analyze(query('aov','channel'),context),/可加/);
});
test('new SKU uses zero baseline; refund-only key survives net full union; no orders AOV is null',async()=>{
  const spec={...query(),currentWindow:{startDate:'2026-10-20',endDateExclusive:'2026-10-21'},baselineWindow:{startDate:'2026-10-13',endDateExclusive:'2026-10-14'},groupBy:'sku'};
  const result=await service.analyze(spec,context);
  assert.equal(result.contributors[0]!.key,'C');assert.equal(result.contributors[0]!.baseline,0);assert.equal(result.comparison.changeRate,null);
  const empty=await service.analyze({...spec,metricId:'aov',groupBy:'none',filters:{skuId:['A']}},context);
  assert.equal(empty.comparison.current,null);assert.equal(empty.comparison.delta,null);
  // Refund period contains no payments for A; A must still be included in the union.
  const data=acceptanceSeed('refund-only');data.refunds[0]!.at='2026-10-20T12:00:00+08:00';data.refunds[1]!.at='2026-10-20T13:00:00+08:00';
  await publishSeed(db.admin,data);
  const net=await service.analyze({...spec,metricId:'net_receipts'}, {...context,datasetVersion:data.version});
  assert.equal(net.comparison.current,-287655);assert.deepEqual(new Set(net.contributors.map(r=>r.key)),new Set(['A','C']));
});
test('filters are AND across keys and OR inside arrays, with unknown values rejected',async()=>{
  const result=await service.analyze({...query(),filters:{skuId:['A','B'],channelId:['douyin','tmall'],regionId:['east']}},context);
  assert.equal(result.comparison.current,7000000);
  assert.equal((await service.analyze({...query(),filters:{regionId:['west']}},context)).comparison.current,0);
  await assert.rejects(()=>service.analyze({...query(),filters:{skuId:["A'); DROP TABLE business.orders;--"]}},context),/未知/);
  await assert.rejects(()=>service.analyze({...query(),filters:{channelId:['fake']}},context),/未知/);
  await assert.rejects(()=>service.analyze({...query(),storeId:'store-other'},context),/契约/);
});
test('read-only role cannot write or see other stores; RLS context resets after commit',async()=>{
  const role=await db.reader.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  assert.equal(role.rows[0].rolsuper,false);assert.equal(role.rows[0].rolbypassrls,false);
  await assert.rejects(()=>db.reader.query('DELETE FROM business.orders'),/permission denied/);
  assert.equal((await db.reader.query('SELECT count(*) FROM business.orders')).rows[0].count,'0');
  assert.equal((await service.analyze(query(),{...context,storeId:'store-other'})).comparison.current,800000000);
  assert.equal((await service.analyze(query(),context)).comparison.current,7000000);
  assert.equal((await db.reader.query('SELECT count(*) FROM business.orders')).rows[0].count,'0');
});
test('source completeness is a mandatory server gate, zero sales are not missing data',async()=>{
  for(const [name,mutate]of [
    ['delayed',(d:ReturnType<typeof acceptanceSeed>)=>{d.completeThrough='2026-10-21';}],
    ['missing',(d:ReturnType<typeof acceptanceSeed>)=>{d.missing=['2026-10-14'];}],
    ['coverage',(d:ReturnType<typeof acceptanceSeed>)=>{d.start='2026-10-15';}],
  ]as const){
    const data=acceptanceSeed(name);mutate(data);await publishSeed(db.admin,data);
    await assert.rejects(()=>service.analyze(query(),{...context,datasetVersion:name}),/覆盖不完整/);
  }
  const data=acceptanceSeed('refund-watermark');
  // A missing refund partition must not prevent payment analysis, but must block refund/net.
  data.sourceOverrides={refund_events:{missing:['2026-10-21']}};
  await publishSeed(db.admin,data);
  const scope={...context,datasetVersion:data.version};
  assert.equal((await service.analyze(query('paid_amount'),scope)).comparison.current,7000000);
  await assert.rejects(()=>service.analyze(query('refund_amount'),scope),/refund_events.*覆盖不完整/);
  await assert.rejects(()=>service.analyze(query('net_receipts'),scope),/refund_events.*覆盖不完整/);
  assert.equal((await service.analyze({...query(),filters:{skuId:['C']}},context)).comparison.current,0);
});
test('published facts cannot be modified or republished, failed publication rolls back',async()=>{
  await assert.rejects(()=>db.admin.query("UPDATE business.orders SET paid_amount_cents=1 WHERE dataset_version='acceptance-v1'"),/immutable/);
  await assert.rejects(()=>db.admin.query("DELETE FROM business.datasets WHERE dataset_version='acceptance-v1'"),/immutable/);
  await assert.rejects(()=>publishSeed(db.admin,acceptanceSeed()),/already exists/);
  const invalid=acceptanceSeed('invalid-refund');invalid.refunds[0]!.amount=6000001;
  await assert.rejects(()=>publishSeed(db.admin,invalid),/refund allocation/);
  assert.equal((await db.admin.query("SELECT count(*) FROM business.datasets WHERE dataset_version='invalid-refund'")).rows[0].count,'0');
  const bad=acceptanceSeed('invalid-order');bad.orders[0]!.amount++;
  await assert.rejects(()=>publishSeed(db.admin,bad),/totals mismatch/);
});
test('Shanghai boundaries are inclusive at start and exclusive at end',async()=>{
  const data=acceptanceSeed('midnight');data.orders.find(o=>o.id==='current' && o.store==='store-demo')!.at='2026-10-20T16:00:00Z';
  data.orders.find(o=>o.id==='new')!.at='2026-10-21T16:00:00Z';
  await publishSeed(db.admin,data);
  assert.equal((await service.analyze(query(),{...context,datasetVersion:data.version})).comparison.current,7000000);
});
test('bulk publication refreshes planner statistics for related facts before validation',async()=>{
  const data=generateSeed(123,5000);
  await publishSeed(db.admin,data);
  const stats=(await db.admin.query(`SELECT relname,reltuples::int AS estimated_rows FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='business' AND relname IN ('orders','order_items','products')`)).rows;
  assert.ok(stats.find(r=>r.relname==='orders').estimated_rows>=5000);
  assert.ok(stats.find(r=>r.relname==='order_items').estimated_rows>=10000);
  assert.ok(stats.find(r=>r.relname==='products').estimated_rows>=30);
  assert.equal((await db.admin.query('SELECT status FROM business.datasets WHERE dataset_version=$1',[data.version])).rows[0].status,'published');
});
test('abort signal cancels a blocked PostgreSQL query and safely returns connection to pool',async()=>{
  const lock=await db.admin.connect();await lock.query('BEGIN');await lock.query('LOCK TABLE business.order_items IN ACCESS EXCLUSIVE MODE');
  const controller=new AbortController();
  const analysis=service.analyze(query(),context,controller.signal);
  const rejected=assert.rejects(analysis,/abort/i);
  try{
    let blocked=false;
    for(let n=0;n<100;n++){
      const rows=(await db.admin.query("SELECT 1 FROM pg_stat_activity WHERE usename='lens_query' AND wait_event_type='Lock'")).rows;
      if(rows.length){blocked=true;break;}await delay(10);
    }
    assert.equal(blocked,true,'Must observe an actual waiting PostgreSQL query before cancelling');
    controller.abort();await rejected;
  }finally{controller.abort();await lock.query('ROLLBACK');lock.release();}
  assert.equal((await service.analyze(query(),context)).comparison.current,7000000);
});
