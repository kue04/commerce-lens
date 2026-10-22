import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { adminPool } from './connections.js';
import { backup,restore } from '../db/snapshot.js';
const pool=adminPool(),mode=process.argv[2];
try{
  if(mode==='backup'){
    const path=resolve(process.env.BACKUP_FILE??`.local/backups/${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    await mkdir(dirname(path),{recursive:true});const snapshot=await backup(pool);await writeFile(path,JSON.stringify(snapshot),{flag:'wx',mode:0o600});console.log(JSON.stringify({path,format:snapshot.format,hash:snapshot.hash}));
  }else if(mode==='restore'){
    if(!process.env.BACKUP_FILE)throw new Error('Set BACKUP_FILE to an existing trusted local backup; restore only supports an empty migrated database');
    console.log(JSON.stringify(await restore(pool,JSON.parse(await readFile(process.env.BACKUP_FILE,'utf8')))));
  }else throw new Error('Use backup or restore');
}finally{await pool.end();}
