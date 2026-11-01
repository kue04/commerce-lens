import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evidenceForModel,inputUpperBound } from '../../packages/agent/src/model-context.js';
import { RunBudget } from '../../packages/agent/src/budget.js';
import type { EvidenceDTO } from '../../packages/contracts/src/http.js';
import { Type } from 'typebox';

test('model previews explicitly mark omissions and preserve null, scope, signal grain, safe integer values and full source DTO',async()=>{
  const sample=JSON.parse(await readFile(new URL('../../packages/contracts/examples/payment-flow.json',import.meta.url),'utf8'));
  const source=sample.report.evidences.find((e:EvidenceDTO)=>e.kind==='contribution') as EvidenceDTO;
  source.contributors=Array.from({length:15},(_,i)=>({...source.contributors![0]!,key:`sku-${i}`}));
  const original=structuredClone(source),view=evidenceForModel(source);
  assert.equal(view.contributorCount,15);assert.equal(view.contributorsOmitted,5);
  assert.equal(view.contributors!.length,10);
  assert.deepEqual(view.scope.filters,source.query.filters);
  assert.deepEqual(view.comparison,source.comparison);
  assert.deepEqual(source,original,'projection cannot mutate saved full evidence');
  const missing=evidenceForModel({...source,kind:'inventory',status:'missing',coverage:null,baselineCoverage:null,rows:[],columns:[]});
  assert.equal(missing.coverage,null);assert.equal(missing.signal,undefined);
  const inventory:EvidenceDTO={...source,kind:'inventory',query:{...source.query,filters:{regionId:['east'],skuId:['A']}},note:'大区共享池，不区分渠道，不能推导具体时段',signal:{type:'inventory',current:{expectedHours:48,observedHours:24,zeroHours:10,coverage:0.5},baseline:{expectedHours:48,observedHours:48,zeroHours:0,coverage:1}}};
  assert.deepEqual(evidenceForModel(inventory).signal,inventory.signal);
  assert.match(evidenceForModel(inventory).note,/共享池/);
  assert.deepEqual(evidenceForModel(inventory).scope.filters.skuId,['A']);
});
test('request preview is side effect free, counts normalized tools, and reserves token and cost headroom without exceeding hard limits',()=>{
  const budget=new RunBudget(new AbortController().signal);
  const context={systemPrompt:'预算',messages:[{role:'user' as const,content:'问题',timestamp:0}]};
  assert.ok(inputUpperBound({...context,tools:[{name:'submit_report',description:'test',parameters:Type.Object({})}]})>inputUpperBound(context));
  const before=structuredClone(budget.usage);
  assert.equal(budget.canRequest(10000,undefined,21000),false);
  assert.deepEqual(budget.usage,before);
  assert.equal(budget.request(10000,undefined,19000),1000);
  assert.equal(budget.usage.modelRequests,1);
  assert.equal(budget.canRequest(10,{input:1,output:100},10000),false);
  const cancelled=new AbortController();cancelled.abort();
  assert.throws(()=>new RunBudget(cancelled.signal).canRequest(1),/abort/i);
});
