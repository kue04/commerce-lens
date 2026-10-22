import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import type { QuerySpec } from '../packages/contracts/src/index.js';
import type { ReportDTO } from '../packages/contracts/src/http.js';
import { startLocalPostgres } from './local-postgres.js';
import { publishSeed } from '../db/seeds/generate.js';
import { scenarioSeed,type ScenarioId } from '../db/seeds/scenarios.js';

// Independent review of saved artifacts: never call buildReport, PaymentTools,
// AnalyticsService or the production hash/validation implementation.
const source=process.argv[2]??'evals/results/audit-2026-10-22T10-43-12-334Z.json';
const sourceBytes=await readFile(source,'utf8');
const audit=JSON.parse(sourceBytes) as {samples:{caseId:string;family:string;report:ReportDTO}[]};
assert.equal(audit.samples.length,20);
const canonical=(value:unknown):string=>{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null && typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
};
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const db=await startLocalPostgres();
try{
  for(const version of new Set(audit.samples.map(s=>s.report.dataset.version))){
    assert.match(version,/^scenario-S\d{2}-v1$/);
    await publishSeed(db.admin,scenarioSeed(version.slice(9,12) as ScenarioId));
  }
  const oracle=await readFile(new URL('../evals/oracles/window.sql',import.meta.url),'utf8');
  async function values(query:QuerySpec,version:string){
    const read=async(window:QuerySpec['currentWindow'])=>{
      const row=(await db.admin.query(oracle,[version,'store-demo',`${window.startDate}T00:00:00+08:00`,`${window.endDateExclusive}T00:00:00+08:00`,query.filters.channelId??null,query.filters.regionId??null,query.filters.skuId??null])).rows[0];
      return Number(row[query.metricId==='refund_amount'?'refund':query.metricId==='sold_units'?'units':'paid']);
    };
    return {current:await read(query.currentWindow),baseline:await read(query.baselineWindow)};
  }
  const results=[];
  for(const sample of audit.samples){
    const r=sample.report,errors:string[]=[],issues:string[]=[];
    const check=(ok:boolean,message:string)=>{if(!ok)errors.push(message);};
    const total=await values(r.query,r.dataset.version);
    check(r.comparison.current===total.current && r.comparison.baseline===total.baseline,'total differs from independent SQL');
    check(r.comparison.delta===total.current-total.baseline,'delta mismatch');
    check(r.comparison.changeRate===(total.baseline===0?null:(total.current-total.baseline)/total.baseline),'rate mismatch');
    for(const c of r.contributors){
      const key={sku:'skuId',channel:'channelId',region:'regionId'}[r.query.groupBy as string] as 'skuId'|'channelId'|'regionId'|undefined;
      assert.ok(key && !c.isOther,'this saved sample review requires explicit SKU/channel/region rows');
      const row=await values({...r.query,filters:{...r.query.filters,[key]:[c.key]}},r.dataset.version);
      check(c.current===row.current && c.baseline===row.baseline && c.delta===row.current-row.baseline,`contributor ${c.key} differs from independent SQL`);
      check(c.share===(r.comparison.delta===0?null:c.delta!/r.comparison.delta!),`contributor ${c.key} share mismatch`);
    }
    for(const key of ['current','baseline','delta'] as const)check(r.contributors.reduce((sum,c)=>sum+c[key]!,0)===r.comparison[key],`conservation ${key}`);
    for(const e of r.evidences){
      check(e.runId===r.runId && e.datasetVersion===r.dataset.version && e.metricVersion===r.provenance.metricVersion,`identity ${e.id}`);
      check(e.metricId===r.query.metricId && e.query.metricId===r.query.metricId && isDeepStrictEqual(e.query.currentWindow,r.query.currentWindow) && isDeepStrictEqual(e.query.baselineWindow,r.query.baselineWindow),`scope ${e.id}`);
      check((['channelId','regionId','skuId'] as const).every(k=>!r.query.filters[k] || e.query.filters[k]?.every(v=>r.query.filters[k]!.includes(v))===true),`expanded filter ${e.id}`);
      if(e.kind==='comparison'||e.kind==='contribution'){
        const contributors=(e.contributors??[]).map(({label,...row})=>row);
        check(e.resultHash===hash({comparison:e.comparison,contributors}),`hash ${e.id}`);
      }else{
        const result={status:e.status,...(e.signal?{signal:e.signal}:{}),coverage:e.coverage,baselineCoverage:e.baselineCoverage,columns:e.columns,rows:e.rows,note:e.note};
        check(e.resultHash===hash(result),`hash ${e.id}`);
        if(e.status==='missing')check(!e.signal && e.coverage===null && e.rows.length===0 && r.unknowns.some(u=>u.includes(e.kind)),`missing source presented as known ${e.id}`);
      }
    }
    for(const fact of r.facts){
      const refs=fact.evidenceIds.map(id=>r.evidences.find(e=>e.id===id));
      check(refs.length>0 && refs.every(e=>e?.status==='success'),'fact references missing/failed evidence');
      for(const path of fact.valueRefs){
        const root=path.startsWith('signal.')?refs[0]:r;
        const resolved=path.split('.').reduce<unknown>((v,key)=>v!==null && typeof v==='object'?(v as Record<string,unknown>)[key]:undefined,root);
        check(resolved!==undefined,`unresolved fact valueRef ${path}`);
      }
    }
    for(const h of r.hypotheses){
      const refs=h.evidenceIds.map(id=>r.evidences.find(e=>e.id===id));
      check(refs.every(e=>e?.status==='success') && h.missingEvidence.length>0,'unsupported hypothesis or missing limitation');
      if(h.text.includes('供应约束') && !refs.some(e=>e?.kind==='contribution'))issues.push('STOCK_DECLINE_REFERENCE_MISSING');
    }
    check(r.dataset.synthetic && !r.provenance.agentExecuted && r.provenance.modelId===null,'mode misrepresentation');
    check(r.unknowns.some(u=>u.includes('不能证明因果')),'causal limit missing');
    results.push({caseId:sample.caseId,family:sample.family,comparison:total,facts:r.facts.length,hypotheses:r.hypotheses.length,numericAndReferenceChecksPassed:errors.length===0,errors,issues});
  }
  const result={mode:'independent-automated-saved-report-review',humanReviewCompleted:false,externalModelCalls:0,
    at:new Date().toISOString(),source,sourceSha256:createHash('sha256').update(sourceBytes).digest('hex'),
    revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    reviewScriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    postgres:(await db.admin.query('SHOW server_version')).rows[0].server_version,
    scope:'Saved reports only; independent SQL checks totals and every contribution. Signal semantics and prose reviewed separately in docs/REPORT-REVIEW.md. No current API/model quality claim.',
    samples:results.length,structuralFailures:results.filter(r=>r.errors.length).length,reportsWithSemanticIssues:results.filter(r=>r.issues.length).length,results};
  const output=`evals/results/report-review-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,samples:result.samples,structuralFailures:result.structuralFailures,reportsWithSemanticIssues:result.reportsWithSemanticIssues,humanReviewCompleted:false}));
  if(result.structuralFailures||result.reportsWithSemanticIssues)process.exitCode=1;
}finally{await db.stop();}
