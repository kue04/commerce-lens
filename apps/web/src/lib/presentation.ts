import type { QuerySpec } from './types';
export const phases = ['理解问题', '数据检查', '商品拆解', '信号核查'];
export const regionLabels: Record<string, string> = { east: '华东', south: '华南', north: '华北', west: '西部' };
export function shiftDate(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(value.valueOf())) throw new Error('业务日期无效');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function clarificationQuery(clock: string, metricId: QuerySpec['metricId'], region: string): QuerySpec {
  return { metricId, currentWindow: { startDate: shiftDate(clock, -1), endDateExclusive: clock },
    baselineWindow: { startDate: shiftDate(clock, -8), endDateExclusive: shiftDate(clock, -7) },
    filters: region ? { regionId: [region] } : {}, groupBy: 'sku', topN: 10 };
}
