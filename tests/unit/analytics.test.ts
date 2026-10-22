import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuerySpec, safeInteger, sumIntegers } from '../../packages/contracts/src/index.js';
import { compare, contributions } from '../../packages/analytics/src/compare.js';
import { defaultWindows, utcWindow, validateWindows, parseDate } from '../../packages/metrics/src/index.js';
import { generateSeed } from '../../db/seeds/generate.js';

const query=()=>({metricId:'paid_amount',...defaultWindows('2026-10-22'),filters:{},groupBy:'sku'});
test('PRD offsetting contributions preserve signs, >100% and other remainder',()=>{
  const total=compare(7000000,10000000);
  assert.deepEqual(total,{current:7000000,baseline:10000000,delta:-3000000,changeRate:-0.3});
  const rows=contributions([{key:'A',current:2000000,baseline:6000000},{key:'B',current:5000000,baseline:4000000}],total,1);
  assert.equal(rows[0]!.share,4/3);assert.equal(rows[1]!.share,-1/3);
  assert.equal(rows[1]!.isOther,true);assert.equal(rows[1]!.delta,1000000);
  assert.throws(()=>contributions([{key:'A',current:1,baseline:0}],total,1),/不守恒/);
  assert.throws(()=>contributions(Array.from({length:201},(_,i)=>({key:String(i),current:1,baseline:0})),compare(201,0),10),/200/);
});
test('zero baseline, zero net change, and integer overflow have explicit behavior',()=>{
  assert.equal(compare(100,0).changeRate,null);
  assert.equal(compare(0,0).delta,0);
  assert.equal(contributions([{key:'A',current:10,baseline:10}],compare(10,10),1)[0]!.share,null);
  assert.throws(()=>safeInteger('9007199254740992'),/安全整数/);
  assert.throws(()=>safeInteger('1.5'),/整数/);
  assert.throws(()=>sumIntegers([Number.MAX_SAFE_INTEGER,1]),/安全整数/);
  assert.throws(()=>compare(Number.MAX_SAFE_INTEGER,-1),/安全整数/);
});
test('ISO calendar validation and Shanghai exclusive midnight handle cross-month/leap-day',()=>{
  assert.deepEqual(utcWindow({startDate:'2024-02-29',endDateExclusive:'2024-03-01'}),['2024-02-28T16:00:00.000Z','2024-02-29T16:00:00.000Z']);
  assert.throws(()=>parseDate('2026-02-29'),/无效/);
  assert.throws(()=>parseDate('2026-2-01'),/ISO/);
  assert.deepEqual(defaultWindows('2026-11-01').currentWindow,{startDate:'2026-10-31',endDateExclusive:'2026-11-01'});
  assert.deepEqual(defaultWindows('2026-10-22','thisWeek').currentWindow,{startDate:'2026-10-19',endDateExclusive:'2026-10-22'});
  assert.throws(()=>defaultWindows('2026-10-19','thisWeek'),/完整/);
});
test('windows reject overlap, unequal lengths, >31 days, and today',()=>{
  const spec=parseQuerySpec(query());validateWindows(spec,'2026-10-22');
  assert.throws(()=>validateWindows({...spec,baselineWindow:spec.currentWindow},'2026-10-22'),/重叠/);
  assert.throws(()=>validateWindows({...spec,currentWindow:{startDate:'2026-10-20',endDateExclusive:'2026-10-22'}},'2026-10-22'),/天数/);
  assert.throws(()=>validateWindows({...spec,currentWindow:{startDate:'2026-09-01',endDateExclusive:'2026-10-22'}},'2026-10-22'),/31/);
  assert.throws(()=>validateWindows({...spec,currentWindow:{startDate:'2026-10-22',endDateExclusive:'2026-10-23'}},'2026-10-22'),/完整/);
});
test('QuerySpec rejects permission overrides, SQL fields, invalid enums, empty/duplicate/oversized filters',()=>{
  for(const input of [
    {...query(),storeId:'other'}, {...query(),snapshotId:'fake'}, {...query(),sql:'DROP TABLE business.orders'},
    {...query(),groupBy:'paid_at; DROP TABLE'}, {...query(),metricId:'profit'}, {...query(),topN:0},
    {...query(),filters:{skuId:[]}}, {...query(),filters:{skuId:['A','A']}},
    {...query(),filters:{skuId:Array.from({length:21},(_,n)=>String(n))}},
    {...query(),currentWindow:{startDate:'2026-10-21',endDateExclusive:'2026-10-22',storeId:'other'}},
  ]) assert.throws(()=>parseQuerySpec(input),/契约/);
});
test('seed is repeatable and independent seeds change facts without embedding answers',()=>{
  assert.deepEqual(generateSeed(42,100),generateSeed(42,100));
  assert.notDeepEqual(generateSeed(42,100).orders,generateSeed(43,100).orders);
  assert.equal(generateSeed(42,100).items.length,200);
});
