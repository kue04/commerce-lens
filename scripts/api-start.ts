import { Pool } from 'pg';
import { buildApp } from '../apps/api/src/app.js';
import { PiPaymentRuntime } from '../packages/agent/src/pi.js';
import { loadEnvironment } from './connections.js';
loadEnvironment();
if(!process.env.APP_DATABASE_URL||!process.env.READONLY_DATABASE_URL)throw new Error('APP_DATABASE_URL and READONLY_DATABASE_URL are required. Run migrations using a separate administrator.');
const mode=process.env.ANALYSIS_MODE??'deterministic';
if(mode!=='agent'&&mode!=='deterministic')throw new Error('Invalid ANALYSIS_MODE');
if(mode==='agent'&&(!process.env.DEEPSEEK_API_KEY||!process.env.DEEPSEEK_MODEL))throw new Error('Agent mode requires explicit credentials and model');
const statePool=new Pool({connectionString:process.env.APP_DATABASE_URL,max:4}),readerPool=new Pool({connectionString:process.env.READONLY_DATABASE_URL,max:4});
const runtime=mode==='agent'?new PiPaymentRuntime(process.env.DEEPSEEK_MODEL!):undefined;
try{
  const app=await buildApp({statePool,readerPool,mode,...(runtime?{runtime}:{})});
  const address=await app.listen({host:'127.0.0.1',port:3000});console.log(`Commerce Lens API: ${address} | ${mode}`);
  let closing=false;const close=async()=>{if(closing)return;closing=true;await app.close();await readerPool.end();await statePool.end();};
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
}catch(error){await readerPool.end();await statePool.end();throw error;}
