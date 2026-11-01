import type { DateWindow,MetricId } from '../../contracts/src/index.js';
import { metrics } from '../../metrics/src/index.js';

export type Watermark={source:string;coverage_start:string;complete_through:string;missing_partitions:string[]};
export function qualityReason(metricId:MetricId,windows:DateWindow[],watermarks:Watermark[]):string|null {
  for(const source of metrics[metricId].sources){
    const watermark=watermarks.find(row=>row.source===source);
    for(const window of windows)if(!watermark||watermark.coverage_start>window.startDate||watermark.complete_through<window.endDateExclusive||watermark.missing_partitions.some(day=>day>=window.startDate&&day<window.endDateExclusive))
      return `${source} 在 ${window.startDate} 至 ${window.endDateExclusive} 覆盖不完整，禁止生成变化结论`;
  }
  return null;
}
