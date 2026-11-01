import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { migrate } from '../db/migrate.js';

class ManagedPostgres extends EmbeddedPostgres {
  private started=false;
  private stopping:Promise<void>|undefined;
  beforeStop:(()=>Promise<void>)|undefined;
  constructor(private readonly directory:string,options:ConstructorParameters<typeof EmbeddedPostgres>[0]){super(options);}
  override async start(){
    if(process.platform!=='win32'){await super.start();this.started=true;return;}
    const {postgres}=await import(`@embedded-postgres/windows-${process.arch}`) as {postgres:string};
    // A detached console-less parent makes PostgreSQL's Windows children each
    // allocate a visible console. Give it one hidden, separate console instead:
    // children inherit it, while Ctrl+C in the API console cannot reach the DB.
    const logPath=resolve(this.directory,`startup-${randomUUID()}.log`);
    const outputPath=logPath+'.stdout';
    const literal=(value:string)=>`'${value.replaceAll("'","''")}'`;
    const args=['-D',this.directory,'-p',String(this.options.port),...this.options.postgresFlags]
      .map(value=>`"${value.replaceAll('"','\\"')}"`).join(' ');
    const script=`$ErrorActionPreference='Stop'; $env:LC_MESSAGES='C'; `+
      `$pg=Start-Process -FilePath ${literal(postgres)} -ArgumentList ${literal(args)} `+
      `-WindowStyle Hidden -RedirectStandardError ${literal(logPath)} -RedirectStandardOutput ${literal(outputPath)} -PassThru; $pg.Id`;
    const {stdout}=await promisify(execFile)('pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});
    const serverPid=Number(stdout.trim());
    if(!Number.isSafeInteger(serverPid)||serverPid<=0)throw new Error('Invalid PostgreSQL process ID');
    // Mark ownership immediately so startup failures still use pg_ctl shutdown.
    this.started=true;
    const deadline=Date.now()+30000;
    let offset=0;
    while(Date.now()<deadline){
      const log=await readFile(logPath,'utf8').catch(()=>'');
      if(log.length>offset){this.options.onLog(log.slice(offset));offset=log.length;}
      if(log.includes('database system is ready to accept connections'))return;
      try{process.kill(serverPid,0);}catch{this.started=false;throw new Error('PostgreSQL exited before readiness');}
      await delay(100);
    }
    throw new Error('PostgreSQL readiness timed out');
  }
  override stop(){return this.stopping??=this.shutdown();}
  private async shutdown(){
    if(!this.started)return;
    await this.beforeStop?.();
    const target=process.platform==='win32'?'windows':process.platform;
    const {pg_ctl}=await import(`@embedded-postgres/${target}-${process.arch}`) as {pg_ctl:string};
    // pg_ctl waits for the cluster shutdown, unlike taskkill's parent-only exit event.
    await promisify(execFile)(pg_ctl,['stop','-D',this.directory,'-m','fast','-w','-t','10'],{windowsHide:true,timeout:15000});
    this.started=false;
  }
}

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
  const credentials=persistent && existsSync(credentialsPath)?JSON.parse(await readFile(credentialsPath,'utf8')) as {admin:string;reader:string;state?:string}:
    {admin:randomBytes(24).toString('hex'),reader:randomBytes(24).toString('hex'),state:randomBytes(24).toString('hex')};
  credentials.state??=randomBytes(24).toString('hex');
  if(persistent) await writeFile(credentialsPath,JSON.stringify(credentials),{mode:0o600});
  const port=persistent?55432:await freePort();
  const logs:string[]=[];
  const database=new ManagedPostgres(directory,{databaseDir:directory,user:'lens_admin',password:credentials.admin,port,persistent:true,
    createPostgresUser:false,authMethod:'scram-sha-256',initdbFlags:['--encoding=UTF8'],
    postgresFlags:['-h','127.0.0.1','-c','max_connections=20'],onLog:message=>logs.push(String(message)),onError:message=>logs.push(String(message))});
  let admin:Pool|undefined,reader:Pool|undefined,state:Pool|undefined;
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
    const stateRole=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='lens_state'");
    if(!stateRole.rowCount)await admin.query(`CREATE ROLE lens_state LOGIN PASSWORD '${credentials.state}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE commerce_app`);
    state=new Pool({...base,user:'lens_state',password:credentials.state});
    if(persistent) await writeFile(resolve(localRoot,'connection.env'),`DATABASE_URL=postgresql://lens_admin:${credentials.admin}@127.0.0.1:${port}/postgres\nREADONLY_DATABASE_URL=postgresql://lens_query:${credentials.reader}@127.0.0.1:${port}/postgres\nAPP_DATABASE_URL=postgresql://lens_state:${credentials.state}@127.0.0.1:${port}/postgres\n`,{mode:0o600});
    const adminPool=admin,readerPool=reader,statePool=state;
    let closed=false;
    let beforeStop:(()=>Promise<void>)|undefined;
    database.beforeStop=async()=>{await beforeStop?.();await readerPool.end();await statePool.end();await adminPool.end();};
    return {admin:adminPool,reader:readerPool,state:statePool,port,beforeStop(handler:()=>Promise<void>){beforeStop=handler;},async stop(){
      if(closed)return;closed=true;
      await database.stop();
      // Windows can retain file handles briefly after the process exit event.
      // fs.rm retries only transient EBUSY/EPERM/ENOTEMPTY, with a bounded delay.
      if(!persistent) await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    }};
  } catch(error) {
    await reader?.end();await state?.end();await admin?.end();
    try { await database.stop(); } catch { /* Original startup error takes precedence. */ }
    throw new Error(`Local PostgreSQL startup failed: ${String(error)}\n${logs.slice(-12).join('\n')}`);
  }
}
