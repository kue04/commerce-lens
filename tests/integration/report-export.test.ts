import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider,fauxAssistantMessage,fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { signalSeed,acceptanceSeed,publishSeed } from '../../db/seeds/generate.js';
import { buildApp } from '../../apps/api/src/app.js';
import { PiPaymentRuntime } from '../../packages/agent/src/pi.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { DomainError,type QuerySpec } from '../../packages/contracts/src/index.js';
import { ReportSchema,type ReportDTO,type RunDTO } from '../../packages/contracts/src/http.js';
import { defaultWindows } from '../../packages/metrics/src/index.js';
import { Value } from 'typebox/value';

let db:Awaited<ReturnType<typeof startLocalPostgres>>;
const version='export-scope-v1',windows=defaultWindows('2026-10-22');
before(async()=>{
  db=await startLocalPostgres();const data=signalSeed(version);
  // The report has two refunded SKUs, but only A's reasons are inspected.
  data.refunds.push({store:'store-demo',id:'r-B',item:'base-B',at:'2026-10-21T05:00:00+08:00',status:'succeeded',amount:50000,units:0,reason:'not_needed'});
  await publishSeed(db.admin,data);await publishSeed(db.admin,acceptanceSeed('export-missing-v1'));
},{timeout:60000});
after(async()=>{await db?.stop();});

async function analyzed(app:Awaited<ReturnType<typeof buildApp>>,query:QuerySpec,question:string,datasetVersion=version){
  const session=await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion}});
  assert.equal(session.statusCode,201,session.body);
  const response=await app.inject({method:'POST',url:`/api/sessions/${session.json().sessionId}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question,confirmedIntent:query}});
  assert.equal(response.statusCode,202,response.body);
  for(let n=0;n<500;n++){
    const run=(await app.inject(`/api/runs/${response.json().runId}`)).json() as RunDTO;
    if(['queued','running'].includes(run.status)){await delay(10);continue;}
    assert.ok(run.reportId,JSON.stringify(run));
    const result=await app.inject(`/api/reports/${run.reportId}`);assert.equal(result.statusCode,200,result.body);
    const report=result.json() as ReportDTO;assert.ok(Value.Check(ReportSchema,report));return report;
  }
  assert.fail('report did not finish');
}

// Extract fenced JSON without importing or mirroring the production renderer.
function jsonBlocks(markdown:string):unknown[]{
  return [...markdown.matchAll(/^(`{3,})json\n([\s\S]*?)\n\1$/gm)].map(m=>JSON.parse(m[2]!));
}
async function exportsMatch(app:Awaited<ReturnType<typeof buildApp>>,report:ReportDTO){
  const stored=(await db.admin.query('SELECT dto FROM app.reports WHERE report_id=$1',[report.id])).rows[0].dto;
  const json=await app.inject(`/api/reports/${report.id}/export?format=json`);
  const md=await app.inject(`/api/reports/${report.id}/export?format=md`);
  assert.equal(json.statusCode,200,json.body);assert.equal(md.statusCode,200,md.body);
  assert.match(String(json.headers['content-type']),/application\/json/);assert.match(String(md.headers['content-type']),/text\/markdown/);
  assert.match(String(md.headers['content-disposition']),new RegExp(`commerce-lens-${report.id}\\.md`));
  assert.deepEqual(json.json(),report);assert.deepEqual(json.json(),stored,'JSON export must preserve the complete persisted report');
  const blocks=jsonBlocks(md.body);
  for(const value of [report.query,report.dataset,report.provenance,report.comparison,report.contributors,report.trace]){
    assert.ok(blocks.some(block=>isDeepStrictEqual(block,value)),'Markdown must retain the structured report scope, units, values and versions');
  }
  for(const e of report.evidences){
    assert.ok(blocks.some(block=>isDeepStrictEqual(block,e)),`Markdown lost scope/columns/coverage/signal/note of ${e.kind} ${e.id}`);
    assert.deepEqual((await app.inject(`/api/evidences/${e.id}`)).json(),e);
  }
  for(const item of [...report.facts,...report.hypotheses]){
    assert.ok(md.body.includes(item.text));for(const id of item.evidenceIds)assert.ok(md.body.includes(id));
  }
  for(const h of report.hypotheses)for(const text of h.missingEvidence)assert.ok(md.body.includes(text));
  for(const text of [...report.unknowns,...report.nextActions,...report.limitations])assert.ok(md.body.includes(text));
  assert.ok(md.body.includes(`状态：${report.status}`));assert.ok(md.body.includes(`单位：${report.unit}`));
  assert.match(md.body,/合成数据/);
  return md.body;
}

test('faux refund and promotion subscopes survive JSON and Markdown exports with independent SQL values',async()=>{
  const faux=fauxProvider({models:[{id:'export-faux',cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]});
  const models=createModels();models.setProvider(faux.provider);
  const app=await buildApp({statePool:db.state,readerPool:db.reader,mode:'agent',runtime:new PiPaymentRuntime('export-faux',models,'faux')});
  try{
    const sql=await readFile(new URL('../../evals/oracles/window.sql',import.meta.url),'utf8');
    const total=(await db.admin.query(sql,[version,'store-demo','2026-10-21T00:00:00+08:00','2026-10-22T00:00:00+08:00',null,null,null])).rows[0];
    const slice=(await db.admin.query(sql,[version,'store-demo','2026-10-21T00:00:00+08:00','2026-10-22T00:00:00+08:00',['douyin'],['east'],['A']])).rows[0];
    assert.equal(Number(total.refund),350000);assert.equal(Number(slice.refund),300000);
    for(const type of ['refund_reason','promotion'] as const){
      const query:QuerySpec={metricId:type==='refund_reason'?'refund_amount':'paid_amount',...windows,filters:{},groupBy:'sku',topN:10};
      const scoped={...query,filters:{skuId:['A'],regionId:['east'],channelId:['douyin']}};
      faux.setResponses([
        fauxAssistantMessage(fauxToolCall('compare_metric',{...query,groupBy:'none'}),{stopReason:'toolUse'}),
        fauxAssistantMessage(fauxToolCall('decompose_change',query),{stopReason:'toolUse'}),
        fauxAssistantMessage(fauxToolCall('inspect_signals',{signalType:type,query:scoped}),{stopReason:'toolUse'}),
        async()=>{
          // Exactly one new run at a time; submitted evidence IDs come from actual persistence.
          const rows=(await db.admin.query("SELECT dto FROM app.evidences WHERE run_id=(SELECT run_id FROM app.runs WHERE status='running' ORDER BY created_at DESC LIMIT 1)")).rows.map(r=>r.dto);
          return fauxAssistantMessage(fauxToolCall('submit_report',{comparisonEvidenceId:rows.find(e=>e.kind==='comparison').id,contributionEvidenceId:rows.find(e=>e.kind==='contribution').id,signalEvidenceIds:[rows.find(e=>e.kind===type).id]}),{stopReason:'toolUse'});
        },
      ]);
      const report=await analyzed(app,query,`核查子范围 ${type}（明确 faux-provider）`);
      assert.equal(report.status,'completed');assert.equal(report.provenance.modelId,'export-faux');
      const evidence=report.evidences.find(e=>e.kind===type)!;assert.deepEqual(evidence.query.filters,scoped.filters);
      if(type==='refund_reason'){
        assert.equal(report.comparison.current,350000);
        assert.ok(evidence.signal?.type==='refund_reason');assert.equal(evidence.signal.reasons.reduce((sum,r)=>sum+r.amountCents,0),300000);
        const fact=report.facts.find(f=>f.evidenceIds.includes(evidence.id))!;
        assert.match(fact.text,/本期/);assert.match(fact.text,/SKU：A/);assert.match(fact.text,/大区：east/);assert.match(fact.text,/渠道：douyin/);
      }else{
        assert.ok(evidence.signal?.type==='promotion');assert.equal(evidence.signal.campaigns[0]!.id,'promotion-A');
        const hypothesis=report.hypotheses.find(h=>h.evidenceIds.includes(evidence.id))!;
        assert.match(hypothesis.text,/SKU：A/);assert.match(hypothesis.text,/渠道：douyin/);assert.match(hypothesis.text,/不支持大区归因/);
      }
      await exportsMatch(app,report);
    }
  }finally{await app.close();}
});

test('partial report status and its limits remain explicit in both export formats',async()=>{
  class FailingDecomposition extends AnalyticsService{
    override async analyze(...args:Parameters<AnalyticsService['analyze']>){
      if((args[0] as QuerySpec).groupBy!=='none')throw new DomainError('TOOL_FAILED','专项导出回归：贡献查询失败');
      return super.analyze(...args);
    }
  }
  const app=await buildApp({statePool:db.state,readerPool:db.reader,analytics:new FailingDecomposition(db.reader)});
  try{
    const report=await analyzed(app,{metricId:'sold_units',...windows,filters:{regionId:['east']},groupBy:'sku'},'昨天华东支付件数');
    assert.equal(report.status,'partial');assert.equal(report.provenance.agentExecuted,false);
    await exportsMatch(app,report);
  }finally{await app.close();}
});
test('missing evidence exports null coverage, empty rows and the source limitation without zero-fill',async()=>{
  const app=await buildApp({statePool:db.state,readerPool:db.reader});
  try{
    const report=await analyzed(app,{metricId:'paid_amount',...windows,filters:{regionId:['east']},groupBy:'sku'},'昨天华东支付金额','export-missing-v1');
    const missing=report.evidences.filter(e=>e.status==='missing');assert.equal(missing.length,3);
    for(const e of missing){assert.equal(e.coverage,null);assert.equal(e.baselineCoverage,null);assert.deepEqual(e.rows,[]);assert.equal(e.signal,undefined);}
    await exportsMatch(app,report);
  }finally{await app.close();}
});
