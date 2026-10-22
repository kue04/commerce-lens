import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider,fauxAssistantMessage,fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { signalSeed,publishSeed } from '../../db/seeds/generate.js';
import { buildApp } from '../../apps/api/src/app.js';
import { PiPaymentRuntime } from '../../packages/agent/src/pi.js';
import { defaultWindows } from '../../packages/metrics/src/index.js';
import { Value } from 'typebox/value';
import { ReportSchema,type ReportDTO } from '../../packages/contracts/src/http.js';
import type { QuerySpec } from '../../packages/contracts/src/index.js';

let db:Awaited<ReturnType<typeof startLocalPostgres>>;
const version='scope-counterexample-v1';
const query:QuerySpec={metricId:'paid_amount',...defaultWindows('2026-10-22'),filters:{},groupBy:'sku',topN:10};
before(async()=>{
  db=await startLocalPostgres();
  const data=signalSeed(version);
  // East/tmall grows, north/douyin falls. Only east/tmall traffic falls and
  // only east A has zero stock. Total A falls solely because north falls.
  for(const [id,amount,quantity] of [['base',5000000,50],['current',500000,5]] as const){
    const order=data.orders.find(o=>o.store==='store-demo' && o.id===id)!;
    order.region='north';order.amount=amount;
    data.items=data.items.filter(i=>!(i.store==='store-demo' && i.order===id && i.sku==='B'));
    const item=data.items.find(i=>i.store==='store-demo' && i.id===`${id}-A`)!;
    item.amount=amount;item.quantity=quantity;
  }
  for(const [id,date,a,b] of [['east-base','2026-10-14',1000000,4000000],['east-current','2026-10-21',1500000,5000000]] as const){
    data.orders.push({store:'store-demo',id,at:`${date}T12:00:00+08:00`,status:'succeeded',channel:'tmall',region:'east',amount:a+b});
    for(const [sku,amount] of [['A',a],['B',b]] as const)data.items.push({store:'store-demo',id:`${id}-${sku}`,order:id,sku,category:'零食',quantity:amount/100000,amount});
  }
  for(const row of data.traffic!)row.sessions=row.date==='2026-10-21' && row.region==='east' && row.channel==='tmall'?700:1000;
  await publishSeed(db.admin,data);
},{timeout:60000});
after(async()=>{await db?.stop();});

async function runFaux(signalType:'inventory'|'traffic',filters:QuerySpec['filters']){
  const faux=fauxProvider({models:[{id:'scope-faux',cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]});
  const models=createModels();models.setProvider(faux.provider);
  const runtime=new PiPaymentRuntime('scope-faux',models,'faux');
  const app=await buildApp({statePool:db.state,readerPool:db.reader,mode:'agent',runtime});
  let runId:string;
  try{
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('compare_metric',{...query,groupBy:'none'}),{stopReason:'toolUse'}),
      fauxAssistantMessage(fauxToolCall('decompose_change',query),{stopReason:'toolUse'}),
      fauxAssistantMessage(fauxToolCall('inspect_signals',{signalType,query:{...query,filters}}),{stopReason:'toolUse'}),
      async()=>{
        const rows=(await db.admin.query('SELECT dto FROM app.evidences WHERE run_id=$1',[runId])).rows.map(r=>r.dto);
        return fauxAssistantMessage(fauxToolCall('submit_report',{comparisonEvidenceId:rows.find(e=>e.kind==='comparison').id,contributionEvidenceId:rows.find(e=>e.kind==='contribution').id,signalEvidenceIds:[rows.find(e=>e.kind===signalType).id]}),{stopReason:'toolUse'});
      },
    ]);
    const session=await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:version}});
    assert.equal(session.statusCode,201,session.body);
    const response=await app.inject({method:'POST',url:`/api/sessions/${session.json().sessionId}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question:'比较完整窗口并核查指定背景范围（faux-provider）',confirmedIntent:query}});
    assert.equal(response.statusCode,202,response.body);
    runId=response.json().runId as string;
    for(let n=0;n<500;n++){
      const run=(await app.inject(`/api/runs/${runId}`)).json();
      if(['queued','running'].includes(run.status)){await delay(10);continue;}
      assert.equal(run.status,'completed',run.message);
      const report=(await app.inject(`/api/reports/${run.reportId}`)).json() as ReportDTO;
      assert.ok(Value.Check(ReportSchema,report));
      assert.equal(faux.state.callCount,4,'only four explicit faux responses, no external provider');
      const evidence=report.evidences.find(e=>e.kind===signalType)!;
      assert.deepEqual(evidence.query.filters,filters);
      assert.deepEqual((await app.inject(`/api/evidences/${evidence.id}`)).json(),evidence);
      assert.equal(report.provenance.modelId,'scope-faux');
      const exported=await app.inject(`/api/reports/${report.id}/export?format=json`);
      assert.deepEqual(exported.json(),report);
      return report;
    }
    assert.fail('faux report did not reach a terminal state');
  }finally{await app.close();}
}

test('narrowed signals cannot explain declines located in another region/channel through real Pi faux + HTTP persistence',async()=>{
  const sql=await readFile(new URL('../../evals/oracles/window.sql',import.meta.url),'utf8');
  // Independent SQL and hand values: east A +500000, north A -4500000.
  for(const [region,baseline,current] of [['east',1000000,1500000],['north',5000000,500000]] as const){
    for(const [window,expected] of [[query.baselineWindow,baseline],[query.currentWindow,current]] as const){
      const row=(await db.admin.query(sql,[version,'store-demo',`${window.startDate}T00:00:00+08:00`,`${window.endDateExclusive}T00:00:00+08:00`,null,[region],['A']])).rows[0];
      assert.equal(Number(row.paid),expected);
    }
  }
  const cases:[('inventory'|'traffic'),QuerySpec['filters']][]=[
    ['inventory',{skuId:['A'],regionId:['east']}],
    ['traffic',{regionId:['east']}],
    ['traffic',{channelId:['tmall']}],
  ];
  for(const [type,filters] of cases){
    const report=await runFaux(type,filters);
    assert.equal(report.comparison.delta,-3000000);
    assert.equal(report.contributors.find(c=>c.key==='A')!.delta,-4000000);
    const evidence=report.evidences.find(e=>e.kind===type)!;
    if(evidence.signal?.type==='inventory')assert.equal(evidence.signal.current.zeroHours,10);
    else{assert.ok(evidence.signal?.type==='traffic');assert.ok(evidence.signal.current.sessions<evidence.signal.baseline.sessions);}
    assert.equal(report.hypotheses.length,0,'the inspected slice grew; total decline happened elsewhere');
    assert.ok(report.facts.some(f=>f.templateId==='signal' && f.evidenceIds.includes(evidence.id)));
    assert.match(report.unknowns.join(' '),/范围/);
  }
});
test('matching traffic retains a limited background explanation through the same faux HTTP path',async()=>{
  const report=await runFaux('traffic',{});
  assert.equal(report.hypotheses.length,1);
  assert.match(report.hypotheses[0]!.text,/不能直接归因到单个 SKU/);
  assert.ok(report.hypotheses[0]!.missingEvidence.length>0);
});
