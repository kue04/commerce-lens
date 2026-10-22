import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { migrate } from '../db/migrate.js';

async function freePort():Promise<number> {
  const server=createServer();
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address || typeof address==='string') throw new Error('No local port');
  const port=address.port;
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}
export async function startLocalPostgres(persistent=false) {
  const localRoot=resolve('.local'), directory=resolve(localRoot,persistent?'postgres':`test-${randomUUID()}`);
  if(!directory.startsWith(localRoot+sep)) throw new Error('Invalid local database path');
  await mkdir(dirname(directory),{recursive:true});
  const credentialsPath=resolve(localRoot,'credentials.json');
  const credentials=persistent && existsSync(credentialsPath)?JSON.parse(await readFile(credentialsPath,'utf8')) as {admin:string;reader:string}:
    {admin:randomBytes(24).toString('hex'),reader:randomBytes(24).toString('hex')};
  if(persistent && !existsSync(credentialsPath)) await writeFile(credentialsPath,JSON.stringify(credentials),{mode:0o600,flag:'wx'});
  const port=persistent?55432:await freePort();
  const logs:string[]=[];
  const database=new EmbeddedPostgres({databaseDir:directory,user:'lens_admin',password:credentials.admin,port,persistent:true,
    createPostgresUser:false,authMethod:'scram-sha-256',initdbFlags:['--encoding=UTF8'],
    postgresFlags:['-h','127.0.0.1','-c','max_connections=20'],onLog:message=>logs.push(String(message)),onError:message=>logs.push(String(message))});
  let admin:Pool|undefined,reader:Pool|undefined;
  try {
    if(!existsSync(resolve(directory,'PG_VERSION'))) await database.initialise();
    await database.start();
    const base={host:'127.0.0.1',port,database:'postgres',max:4,connectionTimeoutMillis:5000};
    admin=new Pool({...base,user:'lens_admin',password:credentials.admin});
    await migrate(admin);
    const role=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='lens_query'");
    // Password is random hex, not user input; SQL identifiers remain fixed.
    if(!role.rowCount) await admin.query(`CREATE ROLE lens_query LOGIN PASSWORD '${credentials.reader}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE commerce_reader`);
    reader=new Pool({...base,user:'lens_query',password:credentials.reader});
    if(persistent) await writeFile(resolve(localRoot,'connection.env'),`DATABASE_URL=postgresql://lens_admin:${credentials.admin}@127.0.0.1:${port}/postgres\nREADONLY_DATABASE_URL=postgresql://lens_query:${credentials.reader}@127.0.0.1:${port}/postgres\n`,{mode:0o600});
    const adminPool=admin,readerPool=reader;
    let closed=false;
    return {admin:adminPool,reader:readerPool,port,async stop(){
      if(closed)return;closed=true;
      await readerPool.end();await adminPool.end();await database.stop();
      if(!persistent) await rm(directory,{recursive:true,force:true});
    }};
  } catch(error) {
    await reader?.end();await admin?.end();
    try { await database.stop(); } catch { /* Original startup error takes precedence. */ }
    throw new Error(`Local PostgreSQL startup failed: ${String(error)}\n${logs.slice(-12).join('\n')}`);
  }
}
