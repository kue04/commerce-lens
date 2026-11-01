import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Value } from 'typebox/value';
import { AnalysisRequestSchema,RunSchema,ReportSchema,EvidenceSchema,RunEventSchema,ErrorSchema,CatalogSchema,OverviewSchema,OverviewRequestSchema,DatasetProfileSchema } from '../../packages/contracts/src/http.js';
test('published HTTP examples comply with shared schemas and actual PRD payment totals',async()=>{
  const samples=JSON.parse(await readFile(new URL('../../packages/contracts/examples/payment-flow.json',import.meta.url),'utf8'));
  for(const [schema,name]of [[AnalysisRequestSchema,'analysisRequest'],[RunSchema,'run'],[ReportSchema,'report'],[EvidenceSchema,'evidence'],[ErrorSchema,'error'],[CatalogSchema,'catalog']]as const)assert.ok(Value.Check(schema,samples[name]),name);
  for(const event of samples.events)assert.ok(Value.Check(RunEventSchema,event));
  assert.equal(samples.report.comparison.current,7000000);assert.equal(samples.report.comparison.baseline,10000000);
  assert.equal(samples.report.provenance.agentExecuted,false);
  assert.equal(Value.Check(AnalysisRequestSchema,{...samples.analysisRequest,storeId:'other'}),false);
});

test('published profile and overview samples use the original QuerySpec and strict HTTP 1.2 schemas',async()=>{
  const overview=JSON.parse(await readFile(new URL('../../packages/contracts/examples/overview.json',import.meta.url),'utf8'));
  const profile=JSON.parse(await readFile(new URL('../../packages/contracts/examples/dataset-profile.json',import.meta.url),'utf8'));
  assert.ok(Value.Check(OverviewRequestSchema,overview.request));assert.ok(Value.Check(OverviewSchema,overview.response));assert.ok(Value.Check(DatasetProfileSchema,profile));
  assert.equal(overview.response.trend.points.length,30);assert.equal(overview.response.agentExecuted,false);
  assert.equal(Value.Check(OverviewRequestSchema,{...overview.request,storeId:'other'}),false);
  for(const contractVersion of ['1.0.0','1.1.0']){
    const old=JSON.parse(await readFile(new URL('../../packages/contracts/examples/payment-flow.json',import.meta.url),'utf8')).report;old.provenance.contractVersion=contractVersion;assert.ok(Value.Check(ReportSchema,old));
  }
});
