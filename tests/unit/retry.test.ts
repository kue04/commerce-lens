import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWithRetry } from '../../packages/analytics/src/retry.js';
test('read retry handles transient SQL errors once and never retries validation or permission errors',async()=>{
  let attempts=0,retries=0;
  assert.equal(await readWithRetry(async()=>{if(++attempts===1)throw {code:'40001'};return 7;},new AbortController().signal,()=>{retries++;}),7);
  assert.equal(attempts,2);assert.equal(retries,1);
  attempts=0;await assert.rejects(()=>readWithRetry(async()=>{attempts++;throw Object.assign(new Error('permission'),{code:'42501'});},new AbortController().signal),/permission/);assert.equal(attempts,1);
});
