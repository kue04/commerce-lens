import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Value } from 'typebox/value';
import { AnalysisRequestSchema,RunSchema,ReportSchema,EvidenceSchema,RunEventSchema,ErrorSchema,CatalogSchema } from '../../packages/contracts/src/http.js';
test('published HTTP examples comply with shared schemas and actual PRD payment totals',async()=>{
  const samples=JSON.parse(await readFile(new URL('../../packages/contracts/examples/payment-flow.json',import.meta.url),'utf8'));
  for(const [schema,name]of [[AnalysisRequestSchema,'analysisRequest'],[RunSchema,'run'],[ReportSchema,'report'],[EvidenceSchema,'evidence'],[ErrorSchema,'error'],[CatalogSchema,'catalog']]as const)assert.ok(Value.Check(schema,samples[name]),name);
  for(const event of samples.events)assert.ok(Value.Check(RunEventSchema,event));
  assert.equal(samples.report.comparison.current,7000000);assert.equal(samples.report.comparison.baseline,10000000);
  assert.equal(samples.report.provenance.agentExecuted,false);
  assert.equal(Value.Check(AnalysisRequestSchema,{...samples.analysisRequest,storeId:'other'}),false);
});
