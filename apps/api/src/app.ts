import Fastify from 'fastify';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { Type } from 'typebox';
import { DomainError,type QuerySpec } from '../../../packages/contracts/src/index.js';
import * as contracts from '../../../packages/contracts/src/http.js';
import { AnalyticsService } from '../../../packages/analytics/src/service.js';
import type { PiPaymentRuntime } from '../../../packages/agent/src/pi.js';
import { Repository,active,type Identity } from './repository.js';
import { Runs } from './runs.js';

type AppOptions={statePool:Pool;readerPool:Pool;mode?:contracts.ExecutionMode;runtime?:PiPaymentRuntime;identity?:Identity;analytics?:AnalyticsService;timeoutMs?:number;recover?:boolean;defaultDataset?:string};
const object=(properties:Record<string,import('typebox').TSchema>)=>Type.Object(properties,{additionalProperties:false});
const params=object({id:Type.String({minLength:1,maxLength:100})});
const errors={400:contracts.ErrorSchema,403:contracts.ErrorSchema,404:contracts.ErrorSchema,409:contracts.ErrorSchema,422:contracts.ErrorSchema,429:contracts.ErrorSchema,500:contracts.ErrorSchema,503:contracts.ErrorSchema};
export async function buildApp(options:AppOptions){
  const mode=options.mode??'deterministic',identity=options.identity??{ownerId:'local-owner',storeId:'store-demo'};
  const app=Fastify({logger:false,bodyLimit:32768,requestTimeout:10000,ajv:{customOptions:{removeAdditional:false,coerceTypes:false,useDefaults:false}}});
  const repository=new Repository(options.statePool,identity);
  async function datasets(){
    const client=await options.readerPool.connect();
    try{
      await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='3s'");
      const records=(await client.query<{dataset_version:string;clock:string;published_at:Date}>("SELECT dataset_version,business_clock::text AS clock,published_at FROM business.datasets WHERE status='published' ORDER BY published_at DESC,dataset_version")).rows;
      const result:contracts.DatasetDTO[]=[];
      for(const row of records){
        await client.query("SELECT set_config('lens.store',$1,true),set_config('lens.dataset',$2,true)",[identity.storeId,row.dataset_version]);
        if((await client.query('SELECT 1 FROM business.products WHERE dataset_version=$1 AND store_id=$2 LIMIT 1',[row.dataset_version,identity.storeId])).rowCount)result.push({version:row.dataset_version,storeName:'禾味食品演示店',synthetic:true,businessClock:row.clock,updatedAt:row.published_at.toISOString(),timezone:'Asia/Shanghai'});
      }
      await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const dataset=async(version?:string)=>{
    const list=await datasets(),chosen=version?list.find(d=>d.version===version):list.find(d=>d.version===options.defaultDataset)??list[0];
    if(!chosen)throw new DomainError(version?'DATASET_NOT_FOUND':'NOT_READY',version?'数据集不存在或不属于当前店铺':'尚无可用数据集');
    return chosen;
  };
  const runs=new Runs(repository,options.analytics??new AnalyticsService(options.readerPool),version=>dataset(version),mode,options.runtime,options.timeoutMs);
  if(options.recover!==false)await repository.interrupt();
  app.addHook('onRequest',async request=>{
    if(!['localhost','127.0.0.1','[::1]'].includes(request.hostname))throw new DomainError('FORBIDDEN_ORIGIN','仅允许本地主机访问');
    const origin=request.headers.origin;
    if(origin && !['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:3000','http://localhost:3000'].includes(origin))throw new DomainError('FORBIDDEN_ORIGIN','不允许的请求来源');
  });
  app.setErrorHandler((error,request,reply)=>{
    const e=error as Error & {validation?:unknown;statusCode?:number};
    const code=error instanceof DomainError?error.code:e.validation?'INVALID_REQUEST':e.statusCode===400?'INVALID_REQUEST':'INTERNAL_ERROR';
    const status=({NOT_FOUND:404,DATASET_NOT_FOUND:422,FORBIDDEN_ORIGIN:403,RUN_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,QUEUE_FULL:429,MODEL_NOT_CONFIGURED:503,NOT_READY:503,INVALID_REQUEST:400,INVALID_KEY:400} as Record<string,number>)[code]??(error instanceof DomainError?422:500);
    void reply.code(status).send({code,message:error instanceof DomainError?error.message:status===400?'请求参数不符合接口契约':'服务暂时无法完成请求',retryable:[429,503].includes(status),traceId:request.id});
  });
  app.setNotFoundHandler((request,reply)=>reply.code(404).send({code:'NOT_FOUND',message:'接口不存在',retryable:false,traceId:request.id}));
  app.get('/api/health/live',async()=>({status:'ok'}));
  app.get('/api/health/ready',async(_request,reply)=>{
    try{await options.statePool.query('SELECT 1');await dataset();return {status:'ready',executionMode:mode};}
    catch{return reply.code(503).send({code:'NOT_READY',message:'数据库或数据集未准备好',retryable:true,traceId:randomUUID()});}
  });
  app.get('/api/catalog',{schema:{response:{200:contracts.CatalogSchema,...errors}}},async()=>({...await dataset(),contractVersion:contracts.CONTRACT_VERSION,executionMode:mode,supportedMetrics:['paid_amount'],datasets:await datasets()}));
  app.post<{Body:{datasetVersion?:string}}>('/api/sessions',{schema:{body:contracts.SessionRequestSchema,response:{201:contracts.SessionResponseSchema,...errors}}},async(request,reply)=>reply.code(201).send(await repository.createSession((await dataset(request.body.datasetVersion)).version)));
  app.get<{Querystring:{limit?:string}}>('/api/sessions',{schema:{response:{200:contracts.HistorySchema,...errors}}},async request=>{
    const limit=request.query.limit===undefined?30:Number(request.query.limit);
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new DomainError('INVALID_REQUEST','limit 必须为 1—50');
    return repository.history(limit);
  });
  app.post<{Params:{id:string};Body:contracts.AnalysisRequest}>('/api/sessions/:id/runs',{schema:{params,body:contracts.AnalysisRequestSchema,response:{202:contracts.StartRunResponseSchema,...errors}}},async(request,reply)=>{
    const key=request.headers['idempotency-key'];
    if(typeof key!=='string'||key.length<1||key.length>100)throw new DomainError('INVALID_KEY','需要 1—100 字符的 Idempotency-Key');
    if(!request.body.question.trim())throw new DomainError('INVALID_REQUEST','问题不能为空');
    if(mode==='agent' && !options.runtime)throw new DomainError('MODEL_NOT_CONFIGURED','当前 Agent 模式没有可用模型配置；不会自动切换为确定性模式');
    const {run,created}=await repository.createRun(request.params.id,request.body,key,mode);
    if(created)runs.enqueue(run.id);
    return reply.code(202).send({runId:run.id,status:run.status,eventsUrl:`/api/runs/${run.id}/events`});
  });
  app.get<{Params:{id:string}}>('/api/runs/:id',{schema:{params,response:{200:contracts.RunSchema,...errors}}},async request=>(await repository.run(request.params.id)).dto);
  app.post<{Params:{id:string}}>('/api/runs/:id/cancel',{schema:{params,body:object({}),response:{200:contracts.RunSchema,...errors}}},async request=>runs.cancel(request.params.id));
  app.get<{Params:{id:string}}>('/api/reports/:id',{schema:{params,response:{200:contracts.ReportSchema,...errors}}},async request=>repository.report(request.params.id));
  app.get<{Params:{id:string}}>('/api/evidences/:id',{schema:{params,response:{200:contracts.EvidenceSchema,...errors}}},async request=>repository.evidence(request.params.id));
  app.get<{Params:{id:string};Querystring:{format?:string}}>('/api/reports/:id/export',{schema:{params}},async(request,reply)=>{
    const report=await repository.report(request.params.id),format=request.query.format??'json';
    if(format!=='md'&&format!=='json')throw new DomainError('INVALID_REQUEST','导出格式仅支持 md/json');
    reply.header('Content-Disposition',`attachment; filename="commerce-lens-${report.id}.${format}"`);
    if(format==='json')return reply.type('application/json; charset=utf-8').send(report);
    return reply.type('text/markdown; charset=utf-8').send([`# ${report.title}`,'> 合成数据',`模式：${report.provenance.executionMode}；Agent 执行：${report.provenance.agentExecuted}`,`范围：${JSON.stringify(report.query)}`,...report.facts.map(f=>`- ${f.text} [${f.evidenceIds.join(', ')}]`),'## 未知',...report.unknowns.map(t=>`- ${t}`),'## 限制',...report.limitations.map(t=>`- ${t}`),'## 证据',...report.evidences.map(e=>`- ${e.id} | ${e.source} | ${e.datasetVersion} | ${e.resultHash}`)].join('\n'));
  });
  app.get<{Params:{id:string}}>('/api/runs/:id/events',{schema:{params}},async(request,reply)=>{
    const id=request.params.id,header=request.headers['last-event-id']??'0';
    if(typeof header!=='string'||!/^\d+$/.test(header)||!Number.isSafeInteger(Number(header)))throw new DomainError('INVALID_REQUEST','Last-Event-ID 必须为非负整数');
    let after=Number(header);const initial=await repository.run(id);
    if(after>initial.last_seq)throw new DomainError('INVALID_REQUEST','事件序号超过当前任务水位');
    reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    reply.raw.write(': connected\n\n');
    const closed=new AbortController();reply.raw.once('close',()=>closed.abort());let heartbeat=Date.now();
    try{
      while(!closed.signal.aborted){
        for(const event of await repository.events(id,after)){reply.raw.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);after=event.seq;}
        const latest=await repository.run(id);
        if(!active(latest.dto.status) && after>=latest.last_seq)break;
        if(Date.now()-heartbeat>=15000){reply.raw.write(': heartbeat\n\n');heartbeat=Date.now();}
        await delay(100,undefined,{signal:closed.signal});
      }
    }catch{ /* Client disconnect or dependency failure: client must query the authoritative run status. */ }
    finally{if(!reply.raw.destroyed)reply.raw.end();}
  });
  app.addHook('preClose',async()=>{await runs.close();});
  return app;
}
