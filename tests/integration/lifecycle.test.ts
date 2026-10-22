import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { acceptanceSeed,publishSeed } from '../../db/seeds/generate.js';
import { buildApp } from '../../apps/api/src/app.js';
import { Repository } from '../../apps/api/src/repository.js';
let db:Awaited<ReturnType<typeof startLocalPostgres>>,app:Awaited<ReturnType<typeof buildApp>>;
before(async()=>{db=await startLocalPostgres();await publishSeed(db.admin,acceptanceSeed());app=await buildApp({statePool:db.state,readerPool:db.reader});await app.ready();},{timeout:60000});
after(async()=>{await app?.close();await db?.stop();});
async function report(){const sid=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:'acceptance-v1'}})).json().sessionId;
  const id=(await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'Idempotency-Key':randomUUID()},payload:{question:'昨天华东支付金额为什么下降？'}})).json().runId;
  for(let n=0;n<200;n++){const run=(await app.inject(`/api/runs/${id}`)).json();if(run.reportId)return {sid,id,reportId:run.reportId as string};await delay(10);}throw new Error('No report');}
test('feedback is owner-scoped and deleting a session removes only its related data',async()=>{
  const one=await report(),two=await report();
  const feedback=await app.inject({method:'POST',url:`/api/reports/${one.reportId}/feedback`,payload:{rating:3,issueType:'evidence',comment:'需要更多证据'}});assert.equal(feedback.statusCode,201,feedback.body);
  const other=await buildApp({statePool:db.state,readerPool:db.reader,recover:false,identity:{ownerId:'other',storeId:'store-demo'}});
  try{assert.equal((await other.inject({method:'DELETE',url:`/api/sessions/${one.sid}`})).statusCode,404);assert.equal((await other.inject({method:'POST',url:`/api/reports/${one.reportId}/feedback`,payload:{rating:1,issueType:'other',comment:''}})).statusCode,404);}finally{await other.close();}
  assert.equal((await app.inject({method:'DELETE',url:`/api/sessions/${one.sid}`})).statusCode,204);
  assert.equal((await app.inject(`/api/reports/${one.reportId}`)).statusCode,404);assert.equal((await app.inject(`/api/runs/${one.id}`)).statusCode,404);
  assert.equal((await app.inject(`/api/reports/${two.reportId}`)).statusCode,200);
  assert.equal((await db.admin.query('SELECT count(*) FROM app.feedback WHERE report_id=$1',[one.reportId])).rows[0].count,'0');
});
test('history cursor is stable with no duplicates; existing array shape is preserved',async()=>{
  await report();await report();const seen=new Set();let cursor:string|undefined;
  for(let n=0;n<10;n++){const response=await app.inject(`/api/sessions?limit=1${cursor?`&cursor=${cursor}`:''}`);assert.equal(response.statusCode,200);const page=response.json();assert.ok(Array.isArray(page));
    for(const row of page){assert.ok(!seen.has(row.reportId));seen.add(row.reportId);}cursor=response.headers['x-next-cursor'] as string|undefined;if(!cursor)break;}
  assert.ok(seen.size>=3);assert.equal((await app.inject('/api/sessions?cursor=broken')).statusCode,400);
});
test('retention deletes only inactive old sessions and never touches business data',async()=>{
  const repository=new Repository(db.state,{ownerId:'retention-owner',storeId:'store-demo'});
  const old=await repository.createSession('acceptance-v1'),fresh=await repository.createSession('acceptance-v1');
  await db.admin.query("UPDATE app.sessions SET created_at=now()-interval '31 days' WHERE session_id=$1",[old.sessionId]);
  assert.equal((await repository.purgeExpired()).deletedSessions,1);await assert.rejects(()=>repository.session(old.sessionId),/不存在/);await repository.session(fresh.sessionId);
  assert.equal((await db.admin.query('SELECT count(*) FROM business.orders')).rows[0].count,'6');
});
test('second live process cannot interrupt the first and per-minute run limit returns 429',async()=>{
  await assert.rejects(()=>buildApp({statePool:db.state,readerPool:db.reader}),/已有后端进程/);
  const limited=await buildApp({statePool:db.state,readerPool:db.reader,recover:false,runRateLimit:1});
  try{const sid=(await limited.inject({method:'POST',url:'/api/sessions',payload:{}})).json().sessionId;
    const options={method:'POST' as const,url:`/api/sessions/${sid}/runs`,payload:{question:'数据异常'},headers:{'Idempotency-Key':randomUUID()}};
    assert.equal((await limited.inject(options)).statusCode,202);assert.equal((await limited.inject({...options,headers:{'Idempotency-Key':randomUUID()}})).statusCode,429);
  }finally{await limited.close();}
});
test('expired SSE replay returns 410 with final-report location instead of pretending a complete replay',async()=>{
  const completed=await report();await db.admin.query('DELETE FROM app.run_events WHERE run_id=$1 AND seq<=3',[completed.id]);
  const response=await app.inject(`/api/runs/${completed.id}/events`);assert.equal(response.statusCode,410);assert.equal(response.json().code,'REPLAY_EXPIRED');
  assert.equal(response.json().details.reportUrl,`/api/reports/${completed.reportId}`);assert.equal((await app.inject(`/api/reports/${completed.reportId}`)).statusCode,200);
});
