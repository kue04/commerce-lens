import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { signalSeed,publishSeed } from '../../db/seeds/generate.js';
import { backup,restore } from '../../db/snapshot.js';
import { AnalyticsService } from '../../packages/analytics/src/service.js';
import { Repository } from '../../apps/api/src/repository.js';
import { defaultWindows } from '../../packages/metrics/src/index.js';
import { buildApp } from '../../apps/api/src/app.js';
import { setTimeout as delay } from 'node:timers/promises';
test('consistent logical backup restores immutable data into an empty database and interrupts active runs',async()=>{
  const source=await startLocalPostgres(),target=await startLocalPostgres();
  try{
    await publishSeed(source.admin,signalSeed());const repo=new Repository(source.state,{ownerId:'local-owner',storeId:'store-demo'});
    const {sessionId}=await repo.createSession('signals-v1');const run=await repo.createRun(sessionId,{question:'昨天支付金额'},'backup-case','deterministic');
    const app=await buildApp({statePool:source.state,readerPool:source.reader,recover:false});let reportId:string|undefined;
    try{
      const sid=(await app.inject({method:'POST',url:'/api/sessions',payload:{datasetVersion:'signals-v1'}})).json().sessionId;
      const id=(await app.inject({method:'POST',url:`/api/sessions/${sid}/runs`,headers:{'Idempotency-Key':'backup-report'},payload:{question:'昨天华东退款金额'}})).json().runId;
      for(let n=0;n<200;n++){const result=(await app.inject(`/api/runs/${id}`)).json();if(result.reportId){reportId=result.reportId;break;}await delay(10);}
      assert.ok(reportId);assert.equal((await app.inject({method:'POST',url:`/api/reports/${reportId}/feedback`,payload:{rating:5,issueType:'correct',comment:'backup-test'}})).statusCode,201);
    }finally{await app.close();}
    const snapshot=await backup(source.admin);await restore(target.admin,JSON.parse(JSON.stringify(snapshot)));
    const restoredRepo=new Repository(target.state,repo.identity);assert.equal((await restoredRepo.run(run.run.id)).dto.status,'interrupted');
    assert.equal((await restoredRepo.report(reportId!)).comparison.current,300000);
    assert.equal((await target.admin.query('SELECT count(*) FROM app.feedback WHERE report_id=$1',[reportId])).rows[0].count,'1');
    const result=await new AnalyticsService(target.reader).analyze({metricId:'paid_amount',...defaultWindows('2026-10-22'),filters:{regionId:['east']},groupBy:'sku'},{storeId:'store-demo',datasetVersion:'signals-v1'});
    assert.equal(result.comparison.current,7000000);
    assert.equal((await target.admin.query('SELECT count(*) FROM business.inventory_hourly')).rows[0].count,'576');
    await assert.rejects(()=>restore(target.admin,snapshot),/空数据库/);
    const tampered=structuredClone(snapshot);tampered.tables['business.orders']![0]!.paid_amount_cents=1;await assert.rejects(()=>restore(target.admin,tampered),/完整性/);
    await assert.rejects(()=>target.admin.query("UPDATE business.orders SET paid_amount_cents=1 WHERE dataset_version='signals-v1'"),/immutable/);
  }finally{await source.stop();await target.stop();}
});
