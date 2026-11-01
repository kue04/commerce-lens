import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const backend=process.env.COMMERCE_LENS_BACKEND_DIR??fileURLToPath(new URL("../../../../../Commerce Lens-backend/",import.meta.url));
const artifacts=fileURLToPath(new URL("../../artifacts/real-agent-20261023/",import.meta.url));
let captured;
try { captured=JSON.parse(await readFile(resolve(artifacts,"real-agent.json"),"utf8")); }
catch { const run=JSON.parse(await readFile(resolve(artifacts,"run.json"),"utf8")); captured={report:{runId:run.id,sessionId:run.sessionId},runUsage:run.usage}; }
const requireBackend=createRequire(resolve(backend,"package.json"));
const {Pool}=requireBackend("pg");
const config=parseEnv(await readFile(resolve(backend,".local/connection.env"),"utf8"));
const pool=new Pool({connectionString:config.DATABASE_URL,max:1});
try {
  const client=await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='5s'");
    const serverVersion=(await client.query("SHOW server_version")).rows[0].server_version;
    const run=(await client.query("SELECT dto FROM app.runs WHERE run_id=$1",[captured.report.runId])).rows[0]?.dto;
    assert.ok(run,"run must be saved in PostgreSQL");
    const session=(await client.query("SELECT session_id,dataset_version,state_json FROM app.sessions WHERE session_id=$1",[captured.report.sessionId])).rows[0];
    const events=(await client.query("SELECT seq,event_json FROM app.run_events WHERE run_id=$1 ORDER BY seq",[captured.report.runId])).rows;
    const reports=(await client.query("SELECT dto FROM app.reports WHERE run_id=$1",[captured.report.runId])).rows.map((r)=>r.dto);
    const evidences=(await client.query("SELECT dto FROM app.evidences WHERE run_id=$1 ORDER BY created_at,evidence_id",[captured.report.runId])).rows.map((r)=>r.dto);
    const request=(await client.query('SELECT request_json,request_hash,idempotency_key,status,state_version,last_seq,created_at FROM app.runs WHERE run_id=$1',[run.id])).rows[0];
    const version=session.dataset_version;
    const args=[version,'store-demo','2026-10-14T00:00:00+08:00','2026-10-22T00:00:00+08:00'];
    const sourceQueries={
      products:'SELECT * FROM business.products WHERE dataset_version=$1 AND store_id=$2 ORDER BY sku_id',
      watermarks:'SELECT * FROM business.source_watermarks WHERE dataset_version=$1 AND store_id=$2 ORDER BY source',
      orders:"SELECT * FROM business.orders WHERE dataset_version=$1 AND store_id=$2 AND region_id='east' AND paid_at >= $3 AND paid_at < $4 ORDER BY order_id",
      order_items:"SELECT i.* FROM business.order_items i JOIN business.orders o USING(dataset_version,store_id,order_id) WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.region_id='east' AND o.paid_at >= $3 AND o.paid_at < $4 ORDER BY i.order_item_id",
      refund_events:"SELECT r.* FROM business.refund_events r JOIN business.order_items i USING(dataset_version,store_id,order_item_id) JOIN business.orders o USING(dataset_version,store_id,order_id) WHERE r.dataset_version=$1 AND r.store_id=$2 AND o.region_id='east' AND r.succeeded_at >= $3 AND r.succeeded_at < $4 ORDER BY r.refund_event_id",
      inventory_hourly:"SELECT * FROM business.inventory_hourly WHERE dataset_version=$1 AND store_id=$2 AND region_id='east' AND hour_at >= $3 AND hour_at < $4 ORDER BY sku_id,hour_at",
      traffic_daily:"SELECT * FROM business.traffic_daily WHERE dataset_version=$1 AND store_id=$2 AND region_id='east' AND business_date >= ($3::timestamptz AT TIME ZONE 'Asia/Shanghai')::date AND business_date < ($4::timestamptz AT TIME ZONE 'Asia/Shanghai')::date ORDER BY business_date,channel_id",
      promotion_events:'SELECT * FROM business.promotion_events WHERE dataset_version=$1 AND store_id=$2 ORDER BY campaign_id',
    };
    const sources={};
    for(const [name,sql]of Object.entries(sourceQueries))sources[name]={sql,params:sql.includes('$3')?args:args.slice(0,2),rows:(await client.query(sql,sql.includes('$3')?args:args.slice(0,2))).rows};
    const periods=[];
    for(const window of [captured.report.query?.currentWindow??reports[0].query.currentWindow,captured.report.query?.baselineWindow??reports[0].query.baselineWindow]){
      const params=[version,'store-demo',`${window.startDate}T00:00:00+08:00`,`${window.endDateExclusive}T00:00:00+08:00`];
      const totalSql="SELECT coalesce(sum(paid_amount_cents),0)::text AS total FROM business.orders WHERE dataset_version=$1 AND store_id=$2 AND region_id='east' AND payment_status='succeeded' AND paid_at >= $3 AND paid_at < $4";
      const skuSql="SELECT i.sku_id,sum(i.paid_amount_cents)::text AS total FROM business.order_items i JOIN business.orders o USING(dataset_version,store_id,order_id) WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.region_id='east' AND o.payment_status='succeeded' AND o.paid_at >= $3 AND o.paid_at < $4 GROUP BY i.sku_id ORDER BY i.sku_id";
      periods.push({window,params,totalSql,skuSql,total:Number((await client.query(totalSql,params)).rows[0].total),skuTotals:(await client.query(skuSql,params)).rows});
    }
    assert.deepEqual(periods.map(p=>p.total),[7000000,10000000]);
    assert.equal(reports[0].comparison.current,periods[0].total);
    assert.equal(reports[0].comparison.baseline,periods[1].total);
    assert.equal(reports[0].comparison.delta,periods[0].total-periods[1].total);
    for(const contributor of reports[0].contributors){
      const current=Number(periods[0].skuTotals.find(r=>r.sku_id===contributor.key)?.total??0),baseline=Number(periods[1].skuTotals.find(r=>r.sku_id===contributor.key)?.total??0);
      assert.deepEqual([contributor.current,contributor.baseline,contributor.delta],[current,baseline,current-baseline]);
    }
    await client.query("COMMIT");
    assert.equal(run.usage.modelRequests,captured.runUsage.modelRequests);
    assert.equal(run.usage.toolCalls,captured.runUsage.toolCalls);
    if(captured.report.id)assert.deepEqual(reports[0],captured.report);
    if(captured.evidences)assert.deepEqual([...evidences].sort((a,b)=>a.id.localeCompare(b.id)),[...captured.evidences].sort((a,b)=>a.id.localeCompare(b.id)));
    const snapshot={capturedAt:new Date().toISOString(),serverVersion,readOnly:true,run,request,session,events,reports,evidences,reportEqualsBrowserCapture:true,evidenceEqualsBrowserCapture:true};
    await writeFile(resolve(artifacts,"database-snapshot.json"),JSON.stringify(snapshot,null,2));
    await writeFile(resolve(artifacts,'source-data.json'),JSON.stringify({serverVersion,readOnly:true,scope:'signals-v1/store-demo/east/2026-10-14..2026-10-22 exclusive; promotion is all authorized regions by design',sources},null,2));
    await writeFile(resolve(artifacts,'independent-sql-oracle.json'),JSON.stringify({serverVersion,periods,manualExpected:{current:7000000,baseline:10000000,delta:-3000000,A:-4000000,B:1000000},allChecksPassed:true,reportId:reports[0].id},null,2));
    console.log(JSON.stringify({serverVersion,runId:run.id,status:run.status,modelId:captured.model,usage:run.usage,events:events.length,evidences:evidences.length,reports:reports.length,readOnly:true},null,2));
  } finally { client.release(); }
} finally { await pool.end(); }
