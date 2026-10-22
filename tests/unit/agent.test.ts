import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RunBudget } from '../../packages/agent/src/budget.js';
import { buildReport } from '../../packages/agent/src/report.js';
import type { ReportDTO } from '../../packages/contracts/src/http.js';
import { resultHash } from '../../packages/analytics/src/hash.js';
test('run budget blocks 9th model and 13th tool attempts before execution',()=>{
  const budget=new RunBudget(new AbortController().signal);
  for(let i=0;i<8;i++)budget.request(10);
  assert.throws(()=>budget.request(10),/模型请求预算/);
  for(let i=0;i<12;i++)budget.tool();
  assert.throws(()=>budget.tool(),/工具调用预算/);
});
test('token reservations, actual usage, expected price and cancellation enforce hard stops',()=>{
  const budget=new RunBudget(new AbortController().signal);
  assert.throws(()=>budget.request(30000),/token/);
  assert.throws(()=>budget.request(1000,{input:1000,output:1000}),/成本/);
  assert.throws(()=>budget.record(30001,null),/预算/);
  const other=new RunBudget(new AbortController().signal);assert.throws(()=>other.record(100,0.31),/预算/);
  const controller=new AbortController();controller.abort();assert.throws(()=>new RunBudget(controller.signal).tool(),/abort/i);
});
test('report rejects invented references, injected free facts, tampered values and cross-run evidence',async()=>{
  const sample=JSON.parse(await readFile(new URL('../../packages/contracts/examples/payment-flow.json',import.meta.url),'utf8'));
  const r=sample.report as ReportDTO;
  const options={draft:{comparisonEvidenceId:r.evidences[0]!.id,contributionEvidenceId:r.evidences[1]!.id},evidences:r.evidences,query:r.query,dataset:r.dataset,runId:r.runId,sessionId:r.sessionId,question:r.question,mode:'deterministic' as const,modelId:null,trace:[]};
  assert.equal(buildReport(options).comparison.current,7000000);
  assert.throws(()=>buildReport({...options,draft:{...options.draft,comparisonEvidenceId:'made-up'}}),/证据不存在/);
  assert.throws(()=>buildReport({...options,draft:{comparisonEvidenceId:options.draft.comparisonEvidenceId}}),/贡献分解/);
  assert.throws(()=>buildReport({...options,draft:{...options.draft,text:'损失 900 万'}}),/不能直接填写/);
  assert.throws(()=>buildReport({...options,runId:'different-run'}),/跨运行/);
  const bad=structuredClone(options);bad.evidences[0]!.comparison!.current=1;
  assert.throws(()=>buildReport(bad),/数字不一致|hash/);
  const wrong=structuredClone(options);wrong.evidences[1]!.contributors![0]!.share=0.5;
  assert.throws(()=>buildReport(wrong),/贡献行数字/);
});

async function stockReportOptions(){
  const audit=JSON.parse(await readFile(new URL('../../evals/results/audit-2026-10-22T10-43-12-334Z.json',import.meta.url),'utf8'));
  // Use a dev sample only; frozen labels and saved reports remain immutable.
  const r=audit.samples.find((s:{caseId:string})=>s.caseId==='dev-stock-only-0').report as ReportDTO;
  const comparison=r.evidences.find(e=>e.kind==='comparison')!,contribution=r.evidences.find(e=>e.kind==='contribution')!,inventory=r.evidences.find(e=>e.kind==='inventory')!;
  return {draft:{comparisonEvidenceId:comparison.id,contributionEvidenceId:contribution.id,signalEvidenceIds:[inventory.id]},evidences:r.evidences,query:r.query,dataset:r.dataset,runId:r.runId,sessionId:r.sessionId,question:r.question,mode:'deterministic' as const,modelId:null,trace:[]};
}
test('stock explanation cites the contribution proving the inspected SKU declined',async()=>{
  const options=await stockReportOptions(),report=buildReport(options);
  const hypothesis=report.hypotheses.find(h=>h.text.includes('供应约束'));
  assert.ok(hypothesis);
  assert.ok(hypothesis.evidenceIds.includes(options.draft.contributionEvidenceId),'stock explanation must cite the SKU decline evidence');
});
test('combined SKU inventory cannot attribute zero hours to an individual declining SKU',async()=>{
  const options=await stockReportOptions();
  const inventory=options.evidences.find(e=>e.kind==='inventory')!;
  inventory.query.filters.skuId=['A','B'];
  assert.ok(inventory.signal?.type==='inventory');
  for(const period of ['current','baseline'] as const){inventory.signal[period].expectedHours=48;inventory.signal[period].observedHours=48;}
  inventory.rows=[['本期',48,48,10],['基期',48,48,0]];
  inventory.resultHash=resultHash({status:inventory.status,signal:inventory.signal,coverage:inventory.coverage,baselineCoverage:inventory.baselineCoverage,columns:inventory.columns,rows:inventory.rows,note:inventory.note});
  const report=buildReport(options);
  assert.ok(report.facts.some(f=>f.templateId==='signal'),'aggregate observation is still a valid fact');
  assert.equal(report.hypotheses.some(h=>h.text.includes('供应约束')),false,'zero hours may belong to the growing SKU B');
  assert.match(report.unknowns.join(' '),/单个.*SKU|逐.*SKU/);
});
test('declining refunds cannot be described as a stock-constrained sales decline',async()=>{
  const options=await stockReportOptions();options.query.metricId='refund_amount';
  for(const e of options.evidences){e.metricId='refund_amount';e.query.metricId='refund_amount';}
  const report=buildReport(options);
  assert.ok(report.comparison.delta!<0);
  assert.equal(report.hypotheses.some(h=>h.text.includes('供应约束')),false);
});
test('stock observations from a narrower region cannot explain the SKU decline across regions',async()=>{
  const options=await stockReportOptions();
  // The contribution covers east+north, but stock was inspected only in east.
  options.query.filters.regionId=['east','north'];
  for(const e of options.evidences.filter(e=>e.kind==='comparison'||e.kind==='contribution'))e.query.filters.regionId=['east','north'];
  const report=buildReport(options);
  assert.equal(report.hypotheses.some(h=>h.text.includes('供应约束')),false,'a regional stock observation does not locate the multi-region SKU decline');
  assert.ok(report.facts.some(f=>f.templateId==='signal'));
  assert.match(report.unknowns.join(' '),/库存.*范围/);
});
async function trafficReportOptions(){
  const audit=JSON.parse(await readFile(new URL('../../evals/results/audit-2026-10-22T10-43-12-334Z.json',import.meta.url),'utf8'));
  const r=audit.samples.find((s:{caseId:string})=>s.caseId==='dev-channel-traffic-0').report as ReportDTO;
  return {draft:{comparisonEvidenceId:r.evidences.find(e=>e.kind==='comparison')!.id,contributionEvidenceId:r.evidences.find(e=>e.kind==='contribution')!.id,signalEvidenceIds:[r.evidences.find(e=>e.kind==='traffic')!.id]},evidences:r.evidences,query:r.query,dataset:r.dataset,runId:r.runId,sessionId:r.sessionId,question:r.question,mode:'deterministic' as const,modelId:null,trace:[]};
}
test('traffic from a narrowed channel or region stays a scoped fact rather than an explanation of the wider total',async()=>{
  for(const dimension of ['channelId','regionId'] as const){
    const options=await trafficReportOptions();
    const traffic=options.evidences.find(e=>e.kind==='traffic')!;
    if(dimension==='channelId')traffic.query.filters.channelId=['tmall'];
    else{
      options.query.filters.regionId=['east','north'];
      for(const e of options.evidences.filter(e=>e.kind==='comparison'||e.kind==='contribution'))e.query.filters.regionId=['east','north'];
    }
    const report=buildReport(options);
    assert.equal(report.hypotheses.length,0,`${dimension}: narrower traffic cannot explain a wider sales decline`);
    const fact=report.facts.find(f=>f.templateId==='signal')!;
    assert.ok(fact.text.includes(dimension==='channelId'?'tmall':'east'),'fact must expose the inspected scope');
    assert.match(report.unknowns.join(' '),/流量.*范围/);
  }
});
test('matching traffic scope retains the bounded explanation',async()=>{
  const report=buildReport(await trafficReportOptions());
  assert.equal(report.hypotheses.length,1);
  assert.match(report.hypotheses[0]!.text,/流量/);
  assert.match(report.hypotheses[0]!.text,/不能.*SKU/);
});
test('narrowing a stock channel cannot use the wider SKU contribution to support a supply explanation',async()=>{
  const options=await stockReportOptions();
  options.evidences.find(e=>e.kind==='inventory')!.query.filters.channelId=['tmall'];
  assert.equal(buildReport(options).hypotheses.length,0);
});
test('filter order and SKU-only narrowing do not suppress matching traffic background',async()=>{
  const options=await trafficReportOptions();
  options.query.filters.channelId=['douyin','tmall'];
  for(const e of options.evidences.filter(e=>e.kind==='comparison'||e.kind==='contribution'))e.query.filters.channelId=['douyin','tmall'];
  const traffic=options.evidences.find(e=>e.kind==='traffic')!;
  traffic.query.filters.channelId=['tmall','douyin'];traffic.query.filters.skuId=['A'];
  assert.equal(buildReport(options).hypotheses.length,1,'filter order is irrelevant and traffic stays SKU-independent background');
});
test('partial traffic coverage and declining refunds cannot support a sales traffic explanation',async()=>{
  for(const kind of ['partial','refund'] as const){
    const options=await trafficReportOptions();
    if(kind==='refund'){
      options.query.metricId='refund_amount';
      for(const e of options.evidences){e.metricId='refund_amount';e.query.metricId='refund_amount';}
    }else{
      const e=options.evidences.find(e=>e.kind==='traffic')!;e.coverage=0.5;
      e.resultHash=resultHash({status:e.status,signal:e.signal,coverage:e.coverage,baselineCoverage:e.baselineCoverage,columns:e.columns,rows:e.rows,note:e.note});
    }
    assert.equal(buildReport(options).hypotheses.length,0,kind);
  }
});
