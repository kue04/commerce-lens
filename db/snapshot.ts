import type { Pool } from 'pg';
import { resultHash } from '../packages/analytics/src/hash.js';
import { DomainError } from '../packages/contracts/src/index.js';
const tables=['business.datasets','business.products','business.orders','business.order_items','business.refund_events','business.source_watermarks','business.inventory_hourly','business.traffic_daily','business.promotion_events','app.sessions','app.runs','app.run_events','app.evidences','app.reports','app.feedback'] as const;
type Row=Record<string,unknown>;
export type Snapshot={format:'commerce-lens-logical-v1';createdAt:string;migrations:{name:string;hash:string}[];tables:Record<string,Row[]>;hash:string};
export async function backup(pool:Pool):Promise<Snapshot>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const migrations=(await client.query<{name:string;hash:string}>('SELECT name,hash FROM public.schema_migrations ORDER BY name')).rows;
    const content:Record<string,Row[]>={};
    for(const table of tables)content[table]=(await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t`)).rows.map((r:{row:Row})=>r.row);
    await client.query('COMMIT');const data={format:'commerce-lens-logical-v1' as const,createdAt:new Date().toISOString(),migrations,tables:content};
    return {...data,hash:resultHash(data)};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function restore(pool:Pool,input:unknown){
  if(!input||typeof input!=='object')throw new DomainError('INVALID_BACKUP','备份格式无效');
  const snapshot=input as Snapshot,{hash,...data}=snapshot;
  if(snapshot.format!=='commerce-lens-logical-v1'||hash!==resultHash(data)||!snapshot.tables||Object.keys(snapshot.tables).sort().join()!==[...tables].sort().join()||tables.some(t=>!Array.isArray(snapshot.tables[t])))throw new DomainError('INVALID_BACKUP','备份完整性或表白名单校验失败');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='60s'");await client.query('SELECT pg_advisory_xact_lock(43821001)');
    const migrations=(await client.query('SELECT name,hash FROM public.schema_migrations ORDER BY name')).rows;
    if(resultHash(migrations)!==resultHash(snapshot.migrations))throw new DomainError('SCHEMA_MISMATCH','备份与目标迁移版本不匹配');
    // Locks prevent a concurrently launched app or publisher from filling the target after this check.
    for(const table of tables)await client.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    for(const table of tables)if((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)throw new DomainError('RESTORE_TARGET_NOT_EMPTY','仅允许恢复到已迁移的空数据库，不覆盖现有数据');
    for(const table of tables){
      const rows=snapshot.tables[table]!;
      if(!rows.length)continue;
      const actual=table==='business.datasets'?rows.map(row=>({...row,status:'draft',published_at:null})):rows;
      for(let i=0;i<actual.length;i+=1000)await client.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(actual.slice(i,i+1000))]);
      if(table==='business.order_items')await client.query('ANALYZE business.order_items');
    }
    for(const row of snapshot.tables['business.datasets']!)if(row.status==='published')await client.query("UPDATE business.datasets SET status='published',published_at=$2 WHERE dataset_version=$1",[row.dataset_version,row.published_at]);
    const active=(await client.query<{run_id:string;last_seq:number;dto:Row}>("SELECT run_id,last_seq,dto FROM app.runs WHERE status IN ('queued','running') FOR UPDATE")).rows;
    for(const run of active){
      const at=new Date().toISOString(),dto={...run.dto,status:'interrupted',endedAt:at,message:'从备份恢复的活动任务已中断，请新建任务'};
      await client.query("UPDATE app.runs SET status='interrupted',dto=$2,last_seq=last_seq+1,state_version=state_version+1 WHERE run_id=$1",[run.run_id,dto]);
      await client.query('INSERT INTO app.run_events(run_id,seq,event_json) VALUES($1,$2,$3)',[run.run_id,run.last_seq+1,{runId:run.run_id,seq:run.last_seq+1,at,type:'run.finished',payload:{status:'interrupted',usage:run.dto.usage,reason:'restored_interrupted'}}]);
    }
    await client.query('COMMIT');return {restoredTables:tables.length,interruptedRuns:active.length};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
