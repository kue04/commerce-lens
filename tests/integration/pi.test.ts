import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider,fauxAssistantMessage,fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { acceptanceSeed,publishSeed } from '../../db/seeds/generate.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { defaultWindows } from '../../packages/metrics/src/index.js';
import { PiPaymentRuntime } from '../../packages/agent/src/pi.js';
import { PaymentTools } from '../../packages/agent/src/tools.js';
import { RunBudget } from '../../packages/agent/src/budget.js';
import type { EvidenceDTO } from '../../packages/contracts/src/http.js';

let db:Awaited<ReturnType<typeof startLocalPostgres>>;
before(async()=>{db=await startLocalPostgres();await publishSeed(db.admin,acceptanceSeed());},{timeout:60000});
after(async()=>{await db?.stop();});
const query={metricId:'paid_amount' as const,...defaultWindows('2026-10-22'),filters:{regionId:['east']},groupBy:'sku' as const,topN:10};
function setup(){
  const faux=fauxProvider({models:[{id:'test-payment',cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]});
  const models=createModels();models.setProvider(faux.provider);
  const runtime=new PiPaymentRuntime('test-payment',models,'faux');
  const saved:EvidenceDTO[]=[],events:unknown[]=[];
  const tools=new PaymentTools(new AnalyticsService(db.reader),query,{storeId:'store-demo',datasetVersion:'acceptance-v1'},
    {version:'acceptance-v1',storeName:'测试模拟店',synthetic:true,businessClock:'2026-10-22',updatedAt:new Date().toISOString(),timezone:'Asia/Shanghai'},
    'test-run','test-session','昨天华东支付金额为什么下降？','agent',runtime.model.id,new RunBudget(new AbortController().signal),
    {phase:async()=>{},event:async(type,payload)=>{events.push({type,payload});},saveEvidence:async e=>{saved.push(e);}});
  return {runtime,faux,tools,saved,events};
}
test('real Pi Agent core executes tool calls against PostgreSQL using explicit faux transport (not DeepSeek verification)',async()=>{
  const {runtime,faux,tools,saved}=setup();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('compare_metric',{...query,groupBy:'none'}),{stopReason:'toolUse'}),
    fauxAssistantMessage(fauxToolCall('decompose_change',query),{stopReason:'toolUse'}),
    ()=>fauxAssistantMessage(fauxToolCall('submit_report',{comparisonEvidenceId:saved.find(e=>e.kind==='comparison')!.id,contributionEvidenceId:saved.find(e=>e.kind==='contribution')!.id}),{stopReason:'toolUse'}),
  ]);
  await runtime.analyze(tools);
  assert.equal(faux.state.callCount,3);assert.equal(saved.length,2);
  assert.equal(tools.render().comparison.current,7000000);assert.equal(tools.budget.usage.modelRequests,3);
  assert.equal(tools.budget.usage.toolCalls,3);assert.ok(tools.budget.usage.tokens>0);
});
test('Pi intent validates model JSON and runtime checks tool scope',async()=>{
  const {runtime,faux,tools,saved}=setup();
  faux.setResponses([fauxAssistantMessage(JSON.stringify({kind:'analysis',query}))]);
  assert.deepEqual(await runtime.intent('昨天华东支付金额', '2026-10-22',tools.budget),query);
  await assert.rejects(()=>tools.execute('compare_metric',{...query,filters:{regionId:['west']}}),/不得改变/);
  assert.equal(saved.length,0);
});
test('model report with invalid reference can be repaired once using only registered results',async()=>{
  const {runtime,faux,tools,saved}=setup();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('compare_metric',{...query,groupBy:'none'}),{stopReason:'toolUse'}),
    fauxAssistantMessage(fauxToolCall('decompose_change',query),{stopReason:'toolUse'}),
    fauxAssistantMessage(fauxToolCall('submit_report',{comparisonEvidenceId:'invented'}),{stopReason:'toolUse'}),
    ()=>fauxAssistantMessage(fauxToolCall('submit_report',{comparisonEvidenceId:saved[0]!.id,contributionEvidenceId:saved[1]!.id}),{stopReason:'toolUse'}),
  ]);
  await runtime.analyze(tools);assert.equal(tools.render().comparison.delta,-3000000);assert.equal(faux.state.callCount,4);
});
test('missing auxiliary signals return explicit missing evidence and cannot support a hypothesis',async()=>{
  const {tools,saved}=setup();
  await tools.execute('inspect_signals',{signalType:'inventory',query});
  assert.equal(saved[0]!.status,'missing');assert.equal(saved[0]!.coverage,null);assert.deepEqual(saved[0]!.rows,[]);
});
test('429 model retry is counted in the same budget and is limited to one extra attempt',async()=>{
  const {runtime,faux,tools}=setup();
  faux.setResponses([fauxAssistantMessage('',{stopReason:'error',errorMessage:'429 Too Many Requests'}),fauxAssistantMessage(JSON.stringify({kind:'analysis',query}))]);
  assert.equal((await runtime.intent('昨天支付金额','2026-10-22',tools.budget))?.metricId,'paid_amount');
  assert.equal(faux.state.callCount,2);assert.equal(tools.budget.usage.modelRequests,2);
  const other=setup();other.faux.setResponses([fauxAssistantMessage('',{stopReason:'error',errorMessage:'401 Unauthorized'})]);
  await assert.rejects(()=>other.runtime.intent('昨天支付金额','2026-10-22',other.tools.budget),/模型调用失败/);assert.equal(other.faux.state.callCount,1);
});
