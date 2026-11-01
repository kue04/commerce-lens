import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeRule } from '../../packages/analytics/src/rules.js';
import { compare } from '../../packages/analytics/src/compare.js';

test('shared original rule thresholds include boundary values and do not trigger on zero or missing baselines',()=>{
  assert.equal(changeRule('paid_amount',compare(8500,10000)),true);assert.equal(changeRule('paid_amount',compare(8501,10000)),false);assert.equal(changeRule('paid_amount',compare(0,9999)),false);
  assert.equal(changeRule('sold_units',compare(16,20)),true);assert.equal(changeRule('sold_units',compare(17,20)),false);assert.equal(changeRule('sold_units',compare(0,19)),false);
  assert.equal(changeRule('refund_amount',compare(15000,10000)),true);assert.equal(changeRule('refund_amount',compare(14999,10000)),false);assert.equal(changeRule('refund_amount',compare(25000,20000)),false);
  for(const metric of ['paid_amount','refund_amount','sold_units'] as const){assert.equal(changeRule(metric,compare(100000,0)),false);assert.equal(changeRule(metric,compare(null,10000)),false);}
});
