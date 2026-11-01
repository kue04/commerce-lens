import { mkdir,writeFile } from 'node:fs/promises';
import { Value } from 'typebox/value';
import { startLocalPostgres } from './local-postgres.js';
import { acceptanceSeed,publishSeed } from '../db/seeds/generate.js';
import { AnalyticsService } from '../packages/analytics/src/service.js';
import { defaultWindows } from '../packages/metrics/src/index.js';
import { makeEvidence,buildReport } from '../packages/agent/src/report.js';
import * as schemas from '../packages/contracts/src/http.js';
import type { TSchema } from 'typebox';
import { portfolioSeed } from '../db/seeds/portfolio.js';
import { buildApp } from '../apps/api/src/app.js';

const db=await startLocalPostgres();
try {
  const data=acceptanceSeed();await publishSeed(db.admin,data);
  const service=new AnalyticsService(db.reader),context={storeId:'store-demo',datasetVersion:data.version};
  const query={metricId:'paid_amount' as const,...defaultWindows(data.clock),filters:{regionId:['east']},groupBy:'sku' as const,topN:10};
  const runId='example-run',sessionId='example-session',question='昨天华东支付金额为什么下降？',now=new Date().toISOString();
  const comparison=makeEvidence(await service.analyze({...query,groupBy:'none'},context),runId,'comparison');
  const contribution=makeEvidence(await service.analyze(query,context),runId,'contribution');
  const dataset:schemas.DatasetDTO={version:data.version,storeName:'禾味食品演示店',synthetic:true,businessClock:data.clock,updatedAt:now,timezone:'Asia/Shanghai'};
  const usage={modelRequests:0,toolCalls:2,tokens:0,costUsd:null};
  const report=buildReport({draft:{comparisonEvidenceId:comparison.id,contributionEvidenceId:contribution.id},evidences:[comparison,contribution],query,dataset,runId,sessionId,question,mode:'deterministic',modelId:null,trace:[]});
  const samples={
    analysisRequest:{question,confirmedIntent:query},
    startRun:{runId,status:'queued',eventsUrl:`/api/runs/${runId}/events`},
    run:{id:runId,sessionId,question,status:'completed',phase:7,phaseName:'persisting',executionMode:'deterministic',createdAt:now,endedAt:now,reportId:report.id,usage},
    catalog:{...dataset,contractVersion:schemas.CONTRACT_VERSION,executionMode:'deterministic',supportedMetrics:['paid_amount','refund_amount','sold_units'],datasets:[dataset]},
    report,evidence:comparison,
    error:{code:'INVALID_QUERY',message:'QuerySpec 不符合受控查询契约',retryable:false,traceId:'example-trace'},
    events:[{runId,seq:1,type:'run.started',at:now,payload:{status:'running',executionMode:'deterministic'}},
      {runId,seq:2,type:'phase.changed',at:now,payload:{phase:3,phaseName:'comparing',action:'比较支付金额'}},
      {runId,seq:3,type:'report.ready',at:now,payload:{reportId:report.id,status:'completed'}},
      {runId,seq:4,type:'run.finished',at:now,payload:{status:'completed',usage,reason:'report_validated'}}],
  };
  for(const [name,schema]of [['analysisRequest',schemas.AnalysisRequestSchema],['startRun',schemas.StartRunResponseSchema],['run',schemas.RunSchema],['catalog',schemas.CatalogSchema],['report',schemas.ReportSchema],['evidence',schemas.EvidenceSchema],['error',schemas.ErrorSchema]] as const) {
    if(!Value.Check(schema,samples[name]))throw new Error(`Invalid contract example: ${name}`);
  }
  for(const event of samples.events)if(!Value.Check(schemas.RunEventSchema,event))throw new Error('Invalid event sample');
  await mkdir('packages/contracts/examples',{recursive:true});
  await writeFile('packages/contracts/examples/payment-flow.json',JSON.stringify(samples,null,2)+'\n');
  const exportedSchemas=Object.fromEntries(Object.entries(schemas).filter(([key])=>key.endsWith('Schema')) as [string,TSchema][]);
  await writeFile('packages/contracts/examples/schemas.json',JSON.stringify(exportedSchemas,null,2)+'\n');
  const portfolio=portfolioSeed();await publishSeed(db.admin,portfolio);
  const app=await buildApp({statePool:db.state,readerPool:db.reader,mode:'deterministic',recover:false,defaultDataset:portfolio.version});
  try{
    const response=await app.inject(`/api/datasets/${portfolio.version}/profile`);
    if(response.statusCode!==200||!Value.Check(schemas.DatasetProfileSchema,response.json()))throw new Error('Invalid actual HTTP profile example');
    await writeFile('packages/contracts/examples/dataset-profile.json',JSON.stringify(response.json(),null,2)+'\n');
    const overviewRequest={...query,filters:{},...defaultWindows(portfolio.clock)};
    const overview=await app.inject({method:'POST',url:`/api/datasets/${portfolio.version}/overview`,payload:overviewRequest});
    if(overview.statusCode!==200||!Value.Check(schemas.OverviewSchema,overview.json()))throw new Error(`Invalid actual HTTP overview example: ${overview.body}`);
    await writeFile('packages/contracts/examples/overview.json',JSON.stringify({request:overviewRequest,response:overview.json()},null,2)+'\n');
  }finally{await app.close();}
  console.log('Shared schemas and actual-PostgreSQL examples validated and saved. Agent was not executed.');
} finally {await db.stop();}
