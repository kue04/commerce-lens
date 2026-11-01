import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { startLocalPostgres } from '../../scripts/local-postgres.js';

test('Windows PostgreSQL child processes keep their console hidden after real SQL connections', {skip:process.platform!=='win32'}, async()=>{
  const db=await startLocalPostgres();
  try {
    const connections=await Promise.all(Array.from({length:3},()=>db.admin.connect()));
    try {
      await Promise.all(connections.map(client=>client.query('SELECT 1')));
      const {postgres}=await import('@embedded-postgres/windows-x64');
      const {stdout}=await promisify(execFile)('pwsh',['-NoProfile','-NonInteractive','-File',resolve('scripts/check-postgres-windows.ps1'),'-BinaryPath',postgres],{windowsHide:true});
      assert.match(stdout,/visiblePostgresWindows=0/);
    } finally { connections.forEach(client=>client.release()); }
  } finally { await db.stop(); }
});
