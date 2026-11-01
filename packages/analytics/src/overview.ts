import { safeInteger,sumIntegers,type DateWindow,type QueryContext,type QuerySpec } from '../../contracts/src/index.js';
import { CONTRACT_VERSION,type DatasetDTO,type OverviewDTO } from '../../contracts/src/http.js';
import { METRIC_VERSION,metrics,shiftDate } from '../../metrics/src/index.js';
import { compare,contributions } from './compare.js';
import { qualityReason } from './quality.js';
import { changeRule,RULE_VERSION } from './rules.js';
import type { AnalyticsService } from './service.js';

export class OverviewService {
  constructor(private readonly analytics:AnalyticsService){}
  async overview(input:unknown,context:QueryContext,dataset:DatasetDTO):Promise<OverviewDTO>{
    const data=await this.analytics.overviewData(input,context),{spec,offset,watermarks}=data;
    const availability=(reason:string|null)=>({available:reason===null,reason});
    const value=(metricId:QuerySpec['metricId'],window:DateWindow)=>{
      if(qualityReason(metricId,[window],watermarks))return null;
      const column=metricId==='refund_amount'?'refund':metricId==='sold_units'?'units':'paid';
      return sumIntegers(data.daily.filter(r=>r.date>=window.startDate&&r.date<window.endDateExclusive).map(r=>safeInteger(r[column])));
    };
    const cards=(['paid_amount','refund_amount','sold_units'] as const).map(metricId=>({metricId,label:metrics[metricId].name,unit:metricId==='sold_units'?'units' as const:'fen' as const,
      comparison:compare(value(metricId,spec.currentWindow),value(metricId,spec.baselineWindow)),availability:availability(qualityReason(metricId,[spec.currentWindow,spec.baselineWindow],watermarks))}));
    const selected=cards.find(card=>card.metricId===spec.metricId)!;
    const points=Array.from({length:30},(_,n)=>{
      const date=shiftDate(data.trendStart,n),baselineDate=shiftDate(date,-offset);
      const currentWindow={startDate:date,endDateExclusive:shiftDate(date,1)},baselineWindow={startDate:baselineDate,endDateExclusive:shiftDate(baselineDate,1)};
      return {date,baselineDate,comparison:compare(value(spec.metricId,currentWindow),value(spec.metricId,baselineWindow)),
        currentAvailability:availability(qualityReason(spec.metricId,[currentWindow],watermarks)),baselineAvailability:availability(qualityReason(spec.metricId,[baselineWindow],watermarks)),
        analysisQuery:{...spec,currentWindow,baselineWindow}};
    });
    const keys=[...new Set(data.grouped.map(r=>r.key))];
    const groupValue=(period:'current'|'baseline',key:string)=>{const row=data.grouped.find(r=>r.period===period&&r.key===key);return safeInteger(row?.[spec.metricId==='refund_amount'?'refund':spec.metricId==='sold_units'?'units':'paid']??0);};
    const contributors=selected.availability.available&&spec.groupBy!=='none'?contributions(keys.map(key=>({key,current:groupValue('current',key),baseline:groupValue('baseline',key)})),selected.comparison,spec.topN!).map(row=>({...row,label:row.key})):[];
    const changes:OverviewDTO['changes']=[];
    if(changeRule(spec.metricId,selected.comparison))changes.push({ruleId:`${RULE_VERSION}:${spec.metricId}:total`,title:`${metrics[spec.metricId].name}变化达到业务规则提示阈值，请核实。`,comparison:selected.comparison,analysisQuery:spec});
    for(const contributor of contributors)if(!contributor.isOther&&changeRule(spec.metricId,contributor)&&changes.length<5){
      const key=spec.groupBy==='sku'?'skuId':spec.groupBy==='channel'?'channelId':spec.groupBy==='region'?'regionId':null;
      // Category has no filter in the original QuerySpec: do not offer an inaccurate drill-down.
      if(!key)continue;
      const dimension=spec.groupBy==='sku'?'SKU':spec.groupBy==='channel'?'渠道':'大区';
      changes.push({ruleId:`${RULE_VERSION}:${spec.metricId}:${spec.groupBy}:${contributor.key}`,title:`${dimension}：${contributor.label} 的${metrics[spec.metricId].name}变化达到业务规则提示阈值，请核实。`,comparison:{current:contributor.current,baseline:contributor.baseline,delta:contributor.delta,changeRate:contributor.changeRate},contributor,analysisQuery:{...spec,filters:{...spec.filters,[key]:[contributor.key]}}});
    }
    return {contractVersion:CONTRACT_VERSION,dataset,query:spec,metricVersion:METRIC_VERSION,ruleVersion:RULE_VERSION,generatedAt:new Date().toISOString(),executionMode:'deterministic',agentExecuted:false,metrics:cards,
      availability:selected.availability,contributors,changes,queryTemplateIds:data.queryTemplateIds,
      trend:{metricId:selected.metricId,currentWindow:{startDate:data.trendStart,endDateExclusive:spec.currentWindow.endDateExclusive},baselineWindow:{startDate:shiftDate(data.trendStart,-offset),endDateExclusive:shiftDate(spec.currentWindow.endDateExclusive,-offset)},offsetDays:offset,points}};
  }
}
