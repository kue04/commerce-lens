import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { startLocalPostgres } from './local-postgres.js';
import { acceptanceSeed,publishSeed } from '../db/seeds/generate.js';
import { buildApp } from '../apps/api/src/app.js';
import { Value } from 'typebox/value';
import { RunEventSchema,ReportSchema,type RunEventDTO } from '../packages/contracts/src/http.js';

const db=await startLocalPostgres();
let app:Awaited<ReturnType<typeof buildApp>>|undefined;
try{
  await publishSeed(db.admin,acceptanceSeed());
  app=await buildApp({statePool:db.state,readerPool:db.reader,defaultDataset:'acceptance-v1'});
  const base=await app.listen({host:'127.0.0.1',port:0});
  const json=async(path:string,body?:unknown,key?:string)=>{
    const response=await fetch(base+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},signal:AbortSignal.timeout(15000)});
    assert.ok(response.ok,`${path}: ${response.status} ${await response.clone().text()}`);return response.json();
  };
  const catalog=await json('/api/catalog');assert.equal(catalog.executionMode,'deterministic');
  const {sessionId}=await json('/api/sessions',{datasetVersion:'acceptance-v1'});
  const started=await json(`/api/sessions/${sessionId}/runs`,{question:'昨天华东支付金额为什么下降？'},'network-smoke');
  const stream=await fetch(base+started.eventsUrl,{signal:AbortSignal.timeout(15000)});assert.equal(stream.status,200);
  assert.match(stream.headers.get('content-type')??'',/text\/event-stream/);
  const data=await stream.text();
  const events:RunEventDTO[]=data.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  for(const event of events)assert.ok(Value.Check(RunEventSchema,event));
  assert.equal(events.at(-1)?.type,'run.finished');
  const run=await json(`/api/runs/${started.runId}`);assert.equal(run.status,'completed');
  const report=await json(`/api/reports/${run.reportId}`);assert.ok(Value.Check(ReportSchema,report));
  assert.equal(report.comparison.current,7000000);assert.equal(report.comparison.baseline,10000000);
  for(const evidence of report.evidences)assert.equal((await json(`/api/evidences/${evidence.id}`)).resultHash,evidence.resultHash);
  const replay=await fetch(base+started.eventsUrl,{headers:{'Last-Event-ID':'3'},signal:AbortSignal.timeout(15000)});
  const replayEvents=(await replay.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  assert.deepEqual(replayEvents,events.slice(3));
  await mkdir('evals/results',{recursive:true});
  await writeFile('evals/results/backend-api-smoke.json',JSON.stringify({at:new Date().toISOString(),mode:'deterministic',network:'real loopback HTTP + SSE',agentExecuted:false,node:process.version,postgres:(await db.admin.query('SHOW server_version')).rows[0].server_version,run,report,events,replayedEvents:replayEvents.length},null,2)+'\n');
  console.log(JSON.stringify({http:'PASS',sse:'PASS',replay:'PASS',persistedReport:'PASS',currentCents:report.comparison.current,baselineCents:report.comparison.baseline,events:events.length,agentExecuted:false}));
}finally{await app?.close();await db.stop();}
