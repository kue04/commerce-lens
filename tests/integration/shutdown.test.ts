import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLocalPostgres } from '../../scripts/local-postgres.js';
import { signalSeed,publishSeed } from '../../db/seeds/generate.js';
import { buildApp } from '../../apps/api/src/app.js';
test('managed database closes API lease before ending connections, including concurrent shutdown requests',async()=>{
  const db=await startLocalPostgres();let closed=false;
  try{
    await publishSeed(db.admin,signalSeed());const app=await buildApp({statePool:db.state,readerPool:db.reader});await app.listen({host:'127.0.0.1',port:0});
    db.beforeStop(async()=>{await app.close();closed=true;});
    await Promise.all([db.stop(),db.stop()]);assert.equal(closed,true);
  }finally{await db.stop();}
});
