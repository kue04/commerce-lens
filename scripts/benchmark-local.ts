import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { cpus,totalmem } from 'node:os';
import { startLocalPostgres } from './local-postgres.js';
import { generateSeed,publishSeed } from '../db/seeds/generate.js';
import { buildApp } from '../apps/api/src/app.js';
const db=await startLocalPostgres();let app:Awaited<ReturnType<typeof buildApp>>|undefined;
try{
  const data=generateSeed(42);await publishSeed(db.admin,data);await db.admin.query('ANALYZE business.orders');await db.admin.query('ANALYZE business.order_items');
  app=await buildApp({statePool:db.state,readerPool:db.reader,defaultDataset:data.version,runRateLimit:1000});
  const base=await app.listen({host:'127.0.0.1',port:0});
  const request=async(path:string,body?:object,key?:string)=>{
    const response=await fetch(base+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},signal:AbortSignal.timeout(15000)});
    assert.ok(response.ok,`${path} HTTP ${response.status}`);return response.json();
  };
  const times:number[]=[];
  for(let n=0;n<120;n++){
    const sid=(await request('/api/sessions',{datasetVersion:data.version})).sessionId,t=performance.now();
    const id=(await request(`/api/sessions/${sid}/runs`,{question:'昨天支付金额为什么下降？'},`benchmark-${n}`)).runId;
    let run:Record<string,any>;
    do{await delay(5);run=await request(`/api/runs/${id}`);}while(['queued','running'].includes(run.status));
    assert.equal(run.status,'completed',run.message);
    const report=await request(`/api/reports/${run.reportId}`);assert.equal(report.provenance.agentExecuted,false);
    if(n>=20)times.push(performance.now()-t);
    if((n+1)%20===0)console.log(JSON.stringify({completed:n+1,warmups:20,samples:times.length}));
  }
  const sorted=[...times].sort((a,b)=>a-b),report={at:new Date().toISOString(),mode:'deterministic',externalModelCalls:0,modelLatencyMeasured:false,network:'real loopback HTTP',orders:100000,orderItems:200000,concurrency:1,warmups:20,samples:100,runRateLimitForBenchmark:1000,
    medianMs:sorted[49],p95Ms:sorted[94],maxMs:sorted.at(-1),timesMs:times,
    environment:{node:process.version,postgres:(await db.admin.query('SHOW server_version')).rows[0].server_version,cpu:cpus()[0]?.model,memoryBytes:totalmem()}};
  await mkdir('evals/results',{recursive:true});const path=`evals/results/performance-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path,medianMs:report.medianMs,p95Ms:report.p95Ms,mode:report.mode,externalModelCalls:0}));
}finally{await app?.close();await db.stop();}
