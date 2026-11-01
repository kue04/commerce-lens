import type { Comparison,MetricId } from '../../contracts/src/index.js';

export const RULE_VERSION='business-rules-v1';
// Shared by immutable report rendering and deterministic overview. Preserve original thresholds.
export function changeRule(metricId:MetricId,comparison:Comparison):boolean {
  if(comparison.current===null||comparison.baseline===null||comparison.delta===null||comparison.changeRate===null)return false;
  return metricId==='refund_amount'?comparison.delta>=5000&&comparison.changeRate>=0.3:
    metricId==='sold_units'?comparison.baseline>=20&&comparison.changeRate<=-0.2:
      comparison.baseline>=10000&&comparison.changeRate<=-0.15;
}
