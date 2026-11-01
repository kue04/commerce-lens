import { startLocalPostgres } from './local-postgres.js';
import { acceptanceSeed,signalSeed,publishSeed } from '../db/seeds/generate.js';
import { portfolioSeed,PORTFOLIO_VERSION } from '../db/seeds/portfolio.js';
import { buildApp } from '../apps/api/src/app.js';
import { PiPaymentRuntime } from '../packages/agent/src/pi.js';
import { loadEnvironment } from './connections.js';
loadEnvironment();
const mode=process.env.ANALYSIS_MODE??'deterministic';
if(mode!=='agent'&&mode!=='deterministic')throw new Error('ANALYSIS_MODE must be deterministic or agent');
if(mode==='agent'&&(!process.env.DEEPSEEK_API_KEY||!process.env.DEEPSEEK_MODEL))throw new Error('Agent mode requires DEEPSEEK_API_KEY and DEEPSEEK_MODEL; no silent fallback');
const runtime=mode==='agent'?new PiPaymentRuntime(process.env.DEEPSEEK_MODEL!):undefined;
const db=await startLocalPostgres(true);
try{
  if(!(await db.admin.query("SELECT 1 FROM business.datasets WHERE dataset_version='acceptance-v1'")).rowCount)await publishSeed(db.admin,acceptanceSeed());
  if(!(await db.admin.query("SELECT 1 FROM business.datasets WHERE dataset_version='signals-v1'")).rowCount)await publishSeed(db.admin,signalSeed());
  if(!(await db.admin.query('SELECT 1 FROM business.datasets WHERE dataset_version=$1',[PORTFOLIO_VERSION])).rowCount)await publishSeed(db.admin,portfolioSeed());
  const app=await buildApp({statePool:db.state,readerPool:db.reader,mode,defaultDataset:PORTFOLIO_VERSION,...(runtime?{runtime}:{})});
  db.beforeStop(()=>app.close());
  const url=await app.listen({host:'127.0.0.1',port:3000});
  console.log(`Commerce Lens API: ${url}/api/catalog | mode=${mode} | synthetic=true | agentExecuted=${mode==='agent'}`);
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;await app.close();await db.stop();};
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
}catch(error){await db.stop();throw error;}
