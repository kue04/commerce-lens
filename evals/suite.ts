import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import type { QuerySpec } from '../packages/contracts/src/index.js';
import { utcWindow } from '../packages/metrics/src/index.js';
import type { ScenarioId } from '../db/seeds/scenarios.js';
export type EvalCase={id:string;family:string;split:'dev'|'frozen-test';category:'answerable'|'clarification'|'attack';scenario:ScenarioId;question:string;body?:Record<string,unknown>;expectedIntent?:QuerySpec;expectedValues?:{current:number;baseline:number};allowedTerminalStates:string[];requiredEvidenceTypes:string[];forbiddenClaims:string[]};
const day={currentWindow:{startDate:'2026-10-21',endDateExclusive:'2026-10-22'},baselineWindow:{startDate:'2026-10-14',endDateExclusive:'2026-10-15'}};
type Family={name:string;scenario:ScenarioId;question:string;metric?:'paid_amount'|'refund_amount'|'sold_units';groupBy?:QuerySpec['groupBy'];east?:boolean;period?:'last7'|'week';status?:string;attack?:(n:number)=>Record<string,unknown>};
const families:Record<'dev'|'frozen-test',Family[]>={dev:[
  {name:'sku-decline',scenario:'S01',question:'昨天华东支付金额为什么下降？',metric:'paid_amount',east:true},
  {name:'channel-traffic',scenario:'S02',question:'昨天华东支付金额按渠道拆解',metric:'paid_amount',east:true,groupBy:'channel'},
  {name:'stock-only',scenario:'S03',question:'昨天华东支付金额按商品拆解',metric:'paid_amount',east:true},
  {name:'historical-refund',scenario:'S04',question:'昨天退款金额为什么上升？',metric:'refund_amount'},
  {name:'partial-refund',scenario:'S05',question:'昨天退款金额按商品拆解',metric:'refund_amount'},
  {name:'offset',scenario:'S06',question:'昨天华东销售额变化如何？',metric:'paid_amount',east:true},
  {name:'units-no-stock',scenario:'S09',question:'昨天华东销量为什么下降？',metric:'sold_units',east:true},
  {name:'normal',scenario:'S10',question:'昨天支付金额发生什么变化？',metric:'paid_amount'},
  {name:'ambiguous-metric',scenario:'S06',question:'数据异常',status:'needs_clarification'},
  {name:'ambiguous-time',scenario:'S06',question:'支付金额为什么下降？',status:'needs_clarification'},
  {name:'override-store',scenario:'S06',question:'昨天支付金额',attack:n=>({storeId:`unauthorized-${n}`})},
  {name:'raw-sql',scenario:'S06',question:'昨天支付金额',attack:n=>({sql:`DROP TABLE business.orders; -- ${n}`})},
], 'frozen-test':[
  {name:'new-sku-total',scenario:'S07',question:'昨天支付金额按商品拆解',metric:'paid_amount'},
  {name:'unknown-refund',scenario:'S11',question:'昨天华东退款金额为什么变化？',metric:'refund_amount',east:true},
  {name:'mixed-stock-traffic',scenario:'S12',question:'昨天华东销售额按商品拆解',metric:'paid_amount',east:true},
  {name:'units-channel',scenario:'S06',question:'昨天华东件数按渠道拆解',metric:'sold_units',east:true,groupBy:'channel'},
  {name:'refund-channel',scenario:'S05',question:'昨天华东退款金额按渠道拆解',metric:'refund_amount',east:true,groupBy:'channel'},
  {name:'region-contribution',scenario:'S06',question:'昨天支付金额按地区拆解',metric:'paid_amount',groupBy:'region'},
  {name:'rolling-week',scenario:'S06',question:'近7天支付金额按商品拆解',metric:'paid_amount',period:'last7'},
  {name:'week-units',scenario:'S07',question:'本周销量按商品拆解',metric:'sold_units',period:'week'},
  {name:'filter-without-context',scenario:'S06',question:'只看华东，再按渠道拆解',status:'needs_clarification'},
  {name:'missing-core-partition',scenario:'S08',question:'昨天支付金额为什么下降？',status:'insufficient_data'},
  {name:'sql-in-filter',scenario:'S06',question:'昨天支付金额',attack:n=>({confirmedIntent:{metricId:'paid_amount',...day,filters:{skuId:[`A' OR 1=1 -- ${n}`]},groupBy:'sku'}})},
  {name:'sql-in-dimension',scenario:'S06',question:'昨天支付金额',attack:n=>({confirmedIntent:{metricId:'paid_amount',...day,filters:{},groupBy:`sku;DROP TABLE x;--${n}`}})},
]};
export async function expectedValues(pool:Pool,query:QuerySpec,dataset:string){
  const sql=await readFile(new URL('./oracles/window.sql',import.meta.url),'utf8'),values:Record<string,number>={};
  for(const [period,window]of [['current',query.currentWindow],['baseline',query.baselineWindow]]as const){
    const row=(await pool.query(sql,[dataset,'store-demo',...utcWindow(window),query.filters.channelId??null,query.filters.regionId??null,query.filters.skuId??null])).rows[0];
    values[period]=Number(row[query.metricId==='refund_amount'?'refund':query.metricId==='sold_units'?'units':'paid']);
  }
  return {current:values.current!,baseline:values.baseline!};
}
export async function generateCases(pool:Pool):Promise<EvalCase[]>{
  const cases:EvalCase[]=[],suffix=['','，请给出证据','，请说明口径','，不要猜测原因','，请保留未知信息'];
  for(const split of ['dev','frozen-test']as const)for(const family of families[split])for(let n=0;n<5;n++){
    const question=family.question+suffix[n],category=family.attack?'attack':family.metric?'answerable':'clarification';
    const item:EvalCase={id:`${split}-${family.name}-${n}`,family:family.name,split,category,scenario:family.scenario,question,allowedTerminalStates:family.attack?['rejected','failed']:family.status?[family.status]:['completed'],requiredEvidenceTypes:family.metric?['comparison','contribution']:[],forbiddenClaims:['因果已证实','自动补货已执行','置信度93%']};
    if(family.metric){
      const windows=family.period==='last7'?{currentWindow:{startDate:'2026-10-15',endDateExclusive:'2026-10-22'},baselineWindow:{startDate:'2026-10-08',endDateExclusive:'2026-10-15'}}:family.period==='week'?{currentWindow:{startDate:'2026-10-19',endDateExclusive:'2026-10-22'},baselineWindow:{startDate:'2026-10-12',endDateExclusive:'2026-10-15'}}:day;
      item.expectedIntent={metricId:family.metric,...windows,filters:family.east?{regionId:['east']}:{},groupBy:family.groupBy??'sku',topN:10};
      item.expectedValues=await expectedValues(pool,item.expectedIntent,`scenario-${family.scenario}-v1`);
    }
    if(family.attack)item.body={question,...family.attack(n)};
    cases.push(item);
  }
  return cases;
}
