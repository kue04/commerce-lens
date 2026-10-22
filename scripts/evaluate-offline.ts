import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { cpus,totalmem } from 'node:os';
import { Value } from 'typebox/value';
import { startLocalPostgres } from './local-postgres.js';
import { publishSeed } from '../db/seeds/generate.js';
import { scenarioIds,scenarioSeed } from '../db/seeds/scenarios.js';
import { buildApp } from '../apps/api/src/app.js';
import { ReportSchema } from '../packages/contracts/src/http.js';
import { resultHash } from '../packages/analytics/src/hash.js';
import { generateCases,type EvalCase } from '../evals/suite.js';

const db=await startLocalPostgres();let app:Awaited<ReturnType<typeof buildApp>>|undefined;
try{
  for(const scenario of scenarioIds)await publishSeed(db.admin,scenarioSeed(scenario));
  await mkdir('evals/cases',{recursive:true});await mkdir('evals/results',{recursive:true});
  const path='evals/cases/offline-v1.json';
  if(!existsSync(path))await writeFile(path,JSON.stringify(await generateCases(db.admin),null,2)+'\n',{flag:'wx'});
  const cases=JSON.parse(await readFile(path,'utf8'))as EvalCase[];
  const manifestPath='evals/cases/offline-v1.manifest.json';
  if(!existsSync(manifestPath))await writeFile(manifestPath,JSON.stringify({version:'offline-v1',hash:resultHash(cases),createdAt:new Date().toISOString(),policy:'Change suite version for case/label edits; preserve previous results.'},null,2)+'\n',{flag:'wx'});
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  assert.equal(manifest.hash,resultHash(cases),'Frozen suite changed: create a new version instead of editing the frozen labels');
  assert.equal(cases.length,120);assert.equal(cases.filter(c=>c.category==='answerable').length,80);
  const devFamilies=new Set(cases.filter(c=>c.split==='dev').map(c=>c.family));assert.ok(cases.filter(c=>c.split==='frozen-test').every(c=>!devFamilies.has(c.family)));
  app=await buildApp({statePool:db.state,readerPool:db.reader,runRateLimit:10000});
  const results:{id:string;split:string;repeat:number;passed:boolean;elapsedMs:number;status:string;errors:string[]}[]=[];
  const reportsForAudit:{caseId:string;family:string;report:unknown}[]=[];
  const immutableHashes=(await db.admin.query('SELECT dataset_version,COUNT(*)::text AS n,SUM(paid_amount_cents)::text AS amount FROM business.orders GROUP BY dataset_version ORDER BY dataset_version')).rows;
  for(const item of cases)for(let repeat=0;repeat<(item.split==='frozen-test'?3:1);repeat++){
    const started=performance.now(),errors:string[]=[];
    const session=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:`scenario-${item.scenario}-v1`}})).json().sessionId;
    const start=await app.inject({method:'POST',url:`/api/sessions/${session}/runs`,headers:{'Idempotency-Key':`${item.id}-${repeat}`},payload:item.body??{question:item.question}});
    let status='rejected';
    if(start.statusCode===202){
      const id=start.json().runId;let run:Record<string,any>|undefined;
      for(let n=0;n<500;n++){const response=await app.inject(`/api/runs/${id}`);run=response.json();if(!['queued','running'].includes(run!.status))break;await delay(5);}
      status=String(run?.status);
      if(item.expectedValues){
        if(!run?.reportId)errors.push('missing_report');else{
          const report=(await app.inject(`/api/reports/${run.reportId}`)).json();
          if(repeat===0)reportsForAudit.push({caseId:item.id,family:item.family,report});
          if(!Value.Check(ReportSchema,report))errors.push('invalid_report_schema');
          if(report.comparison.current!==item.expectedValues.current||report.comparison.baseline!==item.expectedValues.baseline)errors.push('incorrect_value');
          if(resultHash(report.query)!==resultHash(item.expectedIntent))errors.push('incorrect_intent');
          for(const kind of item.requiredEvidenceTypes)if(!report.evidences.some((e:{kind:string})=>e.kind===kind))errors.push(`missing_${kind}`);
          for(const fact of report.facts)if(!fact.evidenceIds.length||fact.evidenceIds.some((ref:string)=>!report.evidences.some((e:{id:string;status:string})=>e.id===ref && e.status==='success')))errors.push('unbound_fact');
          if(report.contributors.reduce((s:number,r:{delta:number})=>s+r.delta,0)!==report.comparison.delta)errors.push('conservation');
          for(const forbidden of item.forbiddenClaims)if(JSON.stringify(report).includes(forbidden))errors.push('forbidden_claim');
          if(report.provenance.agentExecuted)errors.push('mode_misrepresentation');
        }
      }
    }else if(start.statusCode!==400)errors.push(`unexpected_http_${start.statusCode}`);
    if(!item.allowedTerminalStates.includes(status))errors.push(`unexpected_status_${status}`);
    results.push({id:item.id,split:item.split,repeat,passed:!errors.length,elapsedMs:Math.round((performance.now()-started)*100)/100,status,errors});
  }
  assert.deepEqual((await db.admin.query('SELECT dataset_version,COUNT(*)::text AS n,SUM(paid_amount_cents)::text AS amount FROM business.orders GROUP BY dataset_version ORDER BY dataset_version')).rows,immutableHashes);
  const summary={at:new Date().toISOString(),mode:'deterministic',externalModelCalls:0,agentAccuracyMeasured:false,caseHash:resultHash(cases),cases:120,runs:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,
    splitPolicy:'Families disjoint; frozen-test repeated 3 times, dev once. No model is used. Multiple phrasings of a family remain in one split.',
    baselines:{A:'Fixed rule parser + deterministic SQL, measured by this run. Additional verification uses independent SQL values frozen in cases.',B:'NOT_RUN: single model tool choice requires external API',C:'NOT_RUN: real Pi model benchmark requires external API'},
    environment:{node:process.version,postgres:(await db.admin.query('SHOW server_version')).rows[0].server_version,cpu:cpus()[0]?.model,memoryBytes:totalmem(),concurrency:1},results};
  const timestamp=new Date().toISOString().replace(/[:.]/g,'-'),name=`evals/results/offline-${timestamp}.json`;
  const familiesSeen=new Set<string>(),selected:typeof reportsForAudit=[];
  for(const sample of reportsForAudit)if(!familiesSeen.has(sample.family)){familiesSeen.add(sample.family);selected.push(sample);}
  for(const sample of reportsForAudit)if(selected.length<20 && !selected.includes(sample))selected.push(sample);
  await writeFile(`evals/results/audit-${timestamp}.json`,JSON.stringify({mode:'automated-evidence-audit',humanReviewCompleted:false,caseHash:summary.caseHash,samples:selected.slice(0,20)},null,2)+'\n',{flag:'wx'});
  await writeFile(name,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({cases:summary.cases,runs:summary.runs,passed:summary.passed,failed:summary.failed,result:name,externalModelCalls:0}));
  if(summary.failed)process.exitCode=1;
}finally{await app?.close();await db.stop();}
