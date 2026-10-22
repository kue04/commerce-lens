import { createHash,randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { Value } from 'typebox/value';
import { DomainError,type QuerySpec } from '../../../packages/contracts/src/index.js';
import { RunEventSchema, type FeedbackRequest,type AnalysisRequest,type ExecutionMode,type RunDTO,type RunEventDTO,type ReportDTO,type EvidenceDTO } from '../../../packages/contracts/src/http.js';

export const active=(status:RunDTO['status'])=>status==='queued'||status==='running';
export const emptyUsage=()=>({modelRequests:0,toolCalls:0,tokens:0,costUsd:null as number|null});
export type Identity=Readonly<{ownerId:string;storeId:string}>;
type EventInput<T extends RunEventDTO=RunEventDTO>=T extends RunEventDTO?Pick<T,'type'|'payload'>:never;
type SessionRow={session_id:string;dataset_version:string;state_json:QuerySpec|null};
type RunRow={dto:RunDTO;request_json:AnalysisRequest;request_hash:string;last_seq:number};
export function stableHash(value:unknown):string {
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v && typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:1).map(([k,x])=>[k,canonical(x)])):v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export class Repository {
  constructor(readonly pool:Pool,readonly identity:Identity){}
  private args(){return [this.identity.ownerId,this.identity.storeId];}
  private async transaction<T>(work:(client:PoolClient)=>Promise<T>) {
    const client=await this.pool.connect();
    try {await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='3s'");const result=await work(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async session(id:string):Promise<SessionRow> {
    const row=(await this.pool.query<SessionRow>('SELECT session_id,dataset_version,state_json FROM app.sessions WHERE owner_id=$1 AND store_id=$2 AND session_id=$3',[...this.args(),id])).rows[0];
    if(!row)throw new DomainError('NOT_FOUND','会话不存在');return row;
  }
  async createSession(datasetVersion:string){
    const sessionId=randomUUID();await this.pool.query('INSERT INTO app.sessions(session_id,owner_id,store_id,dataset_version) VALUES($3,$1,$2,$4)',[...this.args(),sessionId,datasetVersion]);
    return {sessionId,datasetVersion};
  }
  async history(limit:number,cursor?:string){
    let boundary:{at:string;id:string}|null=null;
    if(cursor){try{boundary=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch{throw new DomainError('INVALID_REQUEST','分页游标无效');}
      if(!boundary||typeof boundary.at!=='string'||!Number.isFinite(Date.parse(boundary.at))||typeof boundary.id!=='string'||boundary.id.length>100)throw new DomainError('INVALID_REQUEST','分页游标无效');}
    const rows=(await this.pool.query<{dto:ReportDTO;at:string}>(`SELECT dto,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM app.reports WHERE owner_id=$1 AND store_id=$2
      AND ($4::timestamptz IS NULL OR (created_at,report_id)<($4::timestamptz,$5::text)) ORDER BY created_at DESC,report_id DESC LIMIT $3`,[...this.args(),limit+1,boundary?.at??null,boundary?.id??null])).rows;
    const selected=rows.slice(0,limit),last=selected.at(-1);
    return {items:selected.map(({dto:r})=>({sessionId:r.sessionId,reportId:r.id,title:r.title,createdAt:r.createdAt,question:r.question})),
      nextCursor:rows.length>limit && last?Buffer.from(JSON.stringify({at:last.at,id:last.dto.id})).toString('base64url'):null};
  }
  async feedback(reportId:string,input:FeedbackRequest){
    const feedbackId=randomUUID();
    const result=await this.pool.query(`INSERT INTO app.feedback(feedback_id,report_id,owner_id,store_id,rating,issue_type,comment)
      SELECT $3,report_id,$1,$2,$5,$6,$7 FROM app.reports WHERE owner_id=$1 AND store_id=$2 AND report_id=$4`,[...this.args(),feedbackId,reportId,input.rating,input.issueType,input.comment]);
    if(!result.rowCount)throw new DomainError('NOT_FOUND','报告不存在');return {feedbackId};
  }
  async activeRuns(sessionId:string){await this.session(sessionId);return (await this.pool.query<{run_id:string}>("SELECT run_id FROM app.runs WHERE owner_id=$1 AND store_id=$2 AND session_id=$3 AND status IN ('queued','running')",[...this.args(),sessionId])).rows.map(r=>r.run_id);}
  async deleteSession(id:string,cutoff?:Date){
    return this.transaction(async client=>{
      const session=(await client.query('SELECT 1 FROM app.sessions WHERE owner_id=$1 AND store_id=$2 AND session_id=$3 FOR UPDATE',[...this.args(),id])).rowCount;
      if(!session)throw new DomainError('NOT_FOUND','会话不存在');
      if((await client.query("SELECT 1 FROM app.runs WHERE session_id=$1 AND (status IN ('queued','running') OR ($2::timestamptz IS NOT NULL AND created_at>=$2))",[id,cutoff??null])).rowCount)throw new DomainError('RUN_CONFLICT','会话有活动或近期任务，不能删除');
      await client.query('DELETE FROM app.feedback WHERE report_id IN (SELECT report_id FROM app.reports WHERE run_id IN (SELECT run_id FROM app.runs WHERE session_id=$1))',[id]);
      await client.query('DELETE FROM app.reports WHERE run_id IN (SELECT run_id FROM app.runs WHERE session_id=$1)',[id]);
      await client.query('DELETE FROM app.evidences WHERE run_id IN (SELECT run_id FROM app.runs WHERE session_id=$1)',[id]);
      await client.query('DELETE FROM app.run_events WHERE run_id IN (SELECT run_id FROM app.runs WHERE session_id=$1)',[id]);
      await client.query('DELETE FROM app.runs WHERE session_id=$1',[id]);await client.query('DELETE FROM app.sessions WHERE session_id=$1',[id]);
    });
  }
  async purgeExpired(now=new Date()){
    const cutoff=new Date(now.getTime()-30*86400000);
    const expired=(await this.pool.query<{session_id:string}>(`SELECT session_id FROM app.sessions s WHERE owner_id=$1 AND store_id=$2 AND created_at<$3
      AND NOT EXISTS(SELECT 1 FROM app.runs r WHERE r.session_id=s.session_id AND (r.status IN ('queued','running') OR r.created_at>=$3))`,[...this.args(),cutoff])).rows;
    let deleted=0;for(const row of expired)try{await this.deleteSession(row.session_id,cutoff);deleted++;}catch(error){if(!(error instanceof DomainError)||!['NOT_FOUND','RUN_CONFLICT'].includes(error.code))throw error;}
    const expiredEvents=await this.pool.query(`DELETE FROM app.run_events e USING app.runs r WHERE e.run_id=r.run_id AND r.owner_id=$1 AND r.store_id=$2 AND r.status NOT IN ('queued','running') AND e.created_at<$3`,[...this.args(),cutoff]);
    return {deletedSessions:deleted,deletedEvents:expiredEvents.rowCount,cutoff:cutoff.toISOString()};
  }
  async createRun(sessionId:string,request:AnalysisRequest,key:string,mode:ExecutionMode) {
    const hash=stableHash({sessionId,request});
    return this.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${this.identity.ownerId}:${key}`]);
      const existing=(await client.query<RunRow & {store_id:string}>('SELECT dto,request_hash,request_json,last_seq,store_id FROM app.runs WHERE owner_id=$1 AND idempotency_key=$2',[this.identity.ownerId,key])).rows[0];
      if(existing){if(existing.store_id!==this.identity.storeId || existing.request_hash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT','此幂等键已经用于不同请求或访问范围');return {run:existing.dto,created:false};}
      const session=(await client.query<SessionRow>('SELECT session_id,dataset_version,state_json FROM app.sessions WHERE owner_id=$1 AND store_id=$2 AND session_id=$3 FOR UPDATE',[...this.args(),sessionId])).rows[0];
      if(!session)throw new DomainError('NOT_FOUND','会话不存在');
      if(request.parentRunId){
        const parent=(await client.query('SELECT 1 FROM app.runs WHERE run_id=$3 AND owner_id=$1 AND store_id=$2 AND session_id=$4',[...this.args(),request.parentRunId,sessionId])).rowCount;
        if(!parent)throw new DomainError('NOT_FOUND','父任务不属于当前会话');
      }
      if((await client.query("SELECT 1 FROM app.runs WHERE session_id=$1 AND status IN ('queued','running')",[sessionId])).rowCount)throw new DomainError('RUN_CONFLICT','此会话已有活动任务');
      await client.query('SELECT pg_advisory_xact_lock(43821002)');
      const count=Number((await client.query("SELECT count(*) FROM app.runs WHERE status IN ('queued','running')")).rows[0].count);
      if(count>=12)throw new DomainError('QUEUE_FULL','任务队列已满');
      const run:RunDTO={id:randomUUID(),sessionId,question:request.question,status:'queued',phase:0,phaseName:'received',executionMode:mode,createdAt:new Date().toISOString(),usage:emptyUsage(),...(request.parentRunId?{parentRunId:request.parentRunId}:{})};
      await client.query('INSERT INTO app.runs(run_id,session_id,owner_id,store_id,idempotency_key,request_hash,request_json,status,dto) VALUES($3,$4,$1,$2,$5,$6,$7,$8,$9)',[...this.args(),run.id,sessionId,key,hash,request,run.status,run]);
      await this.append(client,run.id,{type:'phase.changed',payload:{phase:0,phaseName:'received',action:'接收问题'}});
      return {run,created:true};
    });
  }
  async run(id:string){
    const row=(await this.pool.query<RunRow>('SELECT dto,request_json,request_hash,last_seq FROM app.runs WHERE owner_id=$1 AND store_id=$2 AND run_id=$3',[...this.args(),id])).rows[0];
    if(!row)throw new DomainError('NOT_FOUND','任务不存在');return row;
  }
  async patch(id:string,patch:Partial<RunDTO>,event?:EventInput) {
    return this.transaction(async client=>{
      const row=(await client.query<RunRow>('SELECT dto,last_seq FROM app.runs WHERE owner_id=$1 AND store_id=$2 AND run_id=$3 FOR UPDATE',[...this.args(),id])).rows[0];
      if(!row)throw new DomainError('NOT_FOUND','任务不存在');
      if(!active(row.dto.status))return row.dto;
      const dto={...row.dto,...patch};
      await client.query('UPDATE app.runs SET dto=$2,status=$3,state_version=state_version+1 WHERE run_id=$1',[id,dto,dto.status]);
      if(event)await this.append(client,id,event);
      return dto;
    });
  }
  private async append(client:PoolClient,id:string,input:EventInput){
    const seq=(await client.query<{last_seq:number}>('UPDATE app.runs SET last_seq=last_seq+1 WHERE run_id=$1 RETURNING last_seq',[id])).rows[0]!.last_seq;
    const event={runId:id,seq,at:new Date().toISOString(),...input};
    if(!Value.Check(RunEventSchema,event))throw new DomainError('INVALID_EVENT','服务器事件不符合契约');
    await client.query('INSERT INTO app.run_events(run_id,seq,event_json) VALUES($1,$2,$3)',[id,seq,event]);
  }
  async event(id:string,event:EventInput){
    return this.transaction(async client=>{
      const row=(await client.query<{status:RunDTO['status']}>('SELECT status FROM app.runs WHERE owner_id=$1 AND store_id=$2 AND run_id=$3 FOR UPDATE',[...this.args(),id])).rows[0];
      if(!row)throw new DomainError('NOT_FOUND','任务不存在');
      if(!active(row.status))throw new DomainError('RUN_STOPPED','任务已经停止');
      await this.append(client,id,event);
    });
  }
  async finish(id:string,status:RunDTO['status'],message:string,usage:RunDTO['usage']){
    return this.patch(id,{status,message,endedAt:new Date().toISOString(),usage},{type:'run.finished',payload:{status,message,usage,reason:message}});
  }
  async saveEvidence(evidence:EvidenceDTO){
    await this.transaction(async client=>{
      const row=(await client.query<{status:string}>('SELECT status FROM app.runs WHERE owner_id=$1 AND store_id=$2 AND run_id=$3 FOR UPDATE',[...this.args(),evidence.runId])).rows[0];
      if(row?.status!=='running')throw new DomainError('RUN_STOPPED','任务已经停止');
      await client.query('INSERT INTO app.evidences(evidence_id,run_id,owner_id,store_id,dto) VALUES($3,$4,$1,$2,$5)',[...this.args(),evidence.id,evidence.runId,evidence]);
    });
  }
  async saveReport(report:ReportDTO,usage:RunDTO['usage']){
    return this.transaction(async client=>{
      const row=(await client.query<{dto:RunDTO}>('SELECT dto FROM app.runs WHERE owner_id=$1 AND store_id=$2 AND run_id=$3 FOR UPDATE',[...this.args(),report.runId])).rows[0];
      if(!row || row.dto.status!=='running')throw new DomainError('RUN_STOPPED','任务已经停止');
      await client.query('INSERT INTO app.reports(report_id,run_id,owner_id,store_id,dto) VALUES($3,$4,$1,$2,$5)',[...this.args(),report.id,report.runId,report]);
      const dto:RunDTO={...row.dto,status:report.status,phase:7,phaseName:'persisting',reportId:report.id,endedAt:new Date().toISOString(),usage};
      await client.query('UPDATE app.runs SET status=$2,dto=$3,state_version=state_version+1 WHERE run_id=$1',[report.runId,report.status,dto]);
      await client.query('UPDATE app.sessions SET state_json=$2 WHERE session_id=$1',[report.sessionId,report.query]);
      await this.append(client,report.runId,{type:'report.ready',payload:{reportId:report.id,status:report.status}});
      await this.append(client,report.runId,{type:'run.finished',payload:{status:report.status,usage,reason:'report_validated'}});
      return dto;
    });
  }
  async report(id:string){
    const row=(await this.pool.query<{dto:ReportDTO}>('SELECT dto FROM app.reports WHERE owner_id=$1 AND store_id=$2 AND report_id=$3',[...this.args(),id])).rows[0];
    if(!row)throw new DomainError('NOT_FOUND','报告不存在');return row.dto;
  }
  async evidence(id:string){
    const row=(await this.pool.query<{dto:EvidenceDTO}>('SELECT dto FROM app.evidences WHERE owner_id=$1 AND store_id=$2 AND evidence_id=$3',[...this.args(),id])).rows[0];
    if(!row)throw new DomainError('NOT_FOUND','证据不存在');return row.dto;
  }
  async events(id:string,after:number){await this.run(id);return (await this.pool.query<{event_json:RunEventDTO}>('SELECT event_json FROM app.run_events WHERE run_id=$1 AND seq>$2 ORDER BY seq',[id,after])).rows.map(r=>r.event_json);}
  async firstEventSeq(id:string){await this.run(id);const value=(await this.pool.query('SELECT min(seq) AS first FROM app.run_events WHERE run_id=$1',[id])).rows[0].first;return value===null?null:Number(value);}
  async interrupt(){
    const rows=(await this.pool.query<{dto:RunDTO}>("SELECT dto FROM app.runs WHERE owner_id=$1 AND store_id=$2 AND status IN ('queued','running')",this.args())).rows;
    for(const {dto}of rows)await this.finish(dto.id,'interrupted','服务已重启，请创建新任务重试',dto.usage);
  }
}
