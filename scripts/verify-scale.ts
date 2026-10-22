import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { cpus,totalmem,platform,release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { startLocalPostgres } from './local-postgres.js';
import { generateSeed,publishSeed } from '../db/seeds/generate.js';
import { AnalyticsService } from '../packages/analytics/src/service.js';
import { defaultWindows,utcWindow,metrics } from '../packages/metrics/src/index.js';
import type { MetricId } from '../packages/contracts/src/index.js';

const db=await startLocalPostgres(), service=new AnalyticsService(db.reader);
const results:unknown[]=[];
try {
  const oracleSql=await readFile(new URL('../evals/oracles/aggregate.sql',import.meta.url),'utf8');
  for(const seed of [42,2026]) {
    const started=performance.now(),data=generateSeed(seed);
    const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const sourceHash=hash(data);
    assert.equal(sourceHash,hash(generateSeed(seed)),'Repeated generation must produce the same facts');
    await publishSeed(db.admin,data,stage=>console.log(JSON.stringify({seed,stage,elapsedMs:Math.round(performance.now()-started)})));
    await db.admin.query('ANALYZE business.orders');await db.admin.query('ANALYZE business.order_items');await db.admin.query('ANALYZE business.refund_events');
    const windows=defaultWindows(data.clock),oracle:Record<string,Record<string,string>>={};
    for(const [period,window]of Object.entries(windows))oracle[period==='currentWindow'?'current':'baseline']=(await db.admin.query(oracleSql,[data.version,'store-demo',...utcWindow(window)])).rows[0];
    const timings:Record<string,number>={},values:Record<string,unknown>={};
    for(const metricId of Object.keys(metrics)as MetricId[]) {
      const t=performance.now();
      const spec={metricId,...windows,filters:{},groupBy:metrics[metricId].additive?'sku':'none'};
      const result=await service.analyze(spec,{storeId:'store-demo',datasetVersion:data.version});
      timings[metricId]=Math.round((performance.now()-t)*100)/100;
      for(const period of ['current','baseline']as const) {
        const ref=oracle[period]!,paid=Number(ref.paid),refund=Number(ref.refund),orders=Number(ref.orders);
        const expected={paid_amount:paid,refund_amount:refund,sold_units:Number(ref.units),paid_orders:orders,net_receipts:paid-refund,aov:orders?paid/orders:null}[metricId];
        assert.equal(result.comparison[period],expected,`${seed}/${metricId}/${period}`);
        if(metrics[metricId].additive)assert.equal(result.contributors.reduce((sum,row)=>sum+row[period]!,0),expected,`${metricId} contribution conservation`);
      }
      const repeat=await service.analyze(spec,{storeId:'store-demo',datasetVersion:data.version});
      assert.equal(repeat.evidence.resultHash,result.evidence.resultHash,'Repeated queries preserve numerical evidence hash');
      values[metricId]=result.comparison;
    }
    const explain=(await db.admin.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT SUM(i.paid_amount_cents)
      FROM business.orders o JOIN business.order_items i USING(dataset_version,store_id,order_id)
      WHERE o.dataset_version=$1 AND o.store_id='store-demo' AND o.payment_status='succeeded'
      AND o.paid_at >= '2026-10-20T16:00:00Z' AND o.paid_at < '2026-10-21T16:00:00Z'`,[data.version])).rows[0]['QUERY PLAN'];
    const counts=(await db.admin.query(`SELECT (SELECT count(*)::int FROM business.orders WHERE dataset_version=$1) AS orders,
      (SELECT count(*)::int FROM business.order_items WHERE dataset_version=$1) AS items,
      (SELECT count(*)::int FROM business.products WHERE dataset_version=$1) AS skus,
      (SELECT count(DISTINCT (paid_at AT TIME ZONE 'Asia/Shanghai')::date)::int FROM business.orders WHERE dataset_version=$1) AS days`,[data.version])).rows[0];
    assert.deepEqual(counts,{orders:100000,items:200000,skus:30,days:90});
    const record={seed,datasetVersion:data.version,sourceHash,counts,refundEvents:data.refunds.length,elapsedMs:Math.round(performance.now()-started),queryMs:timings,values,explain};
    results.push(record);console.log(JSON.stringify({seed,counts,oracle:'PASS',reproducibility:'PASS',queryMs:timings}));
  }
  const report={at:new Date().toISOString(),mode:'deterministic_postgresql_validation',agentExecuted:false,networkModelCalls:0,
    environment:{node:process.version,postgres:(await db.admin.query('SHOW server_version')).rows[0].server_version,platform:platform(),release:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem(),concurrency:1},results};
  await mkdir('evals/results',{recursive:true});await writeFile('evals/results/m1-scale.json',JSON.stringify(report,null,2)+'\n');
  console.log('Saved evals/results/m1-scale.json. This is not an Agent benchmark or a P95 measurement.');
} finally {await db.stop();}
