import type { Pool } from 'pg';
import { parseQuerySpec,safeInteger,DomainError,type QueryContext } from '../../contracts/src/index.js';
import type { SignalData } from '../../contracts/src/http.js';
import { utcWindow,windowDays,validateWindows } from '../../metrics/src/index.js';
import { watchQueryAbort } from './cancellation.js';
export type SignalType='inventory'|'traffic'|'promotion'|'refund_reason';
export type SignalResult={status:'success'|'missing';signal?:SignalData;coverage:number|null;baselineCoverage:number|null;columns:string[];rows:(string|number|null)[][];note:string};

export class SignalService {
  constructor(private readonly pool:Pool){}
  async inspect(input:unknown,type:SignalType,context:QueryContext,signal?:AbortSignal):Promise<SignalResult>{
    const query=parseQuerySpec(input),client=await this.pool.connect();
    let watcher:Awaited<ReturnType<typeof watchQueryAbort>>|undefined;
    try{
      watcher=await watchQueryAbort(this.pool,client,signal);signal?.throwIfAborted();
      await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='3s'");
      await client.query("SELECT set_config('lens.store',$1,true),set_config('lens.dataset',$2,true)",[context.storeId,context.datasetVersion]);
      const dataset=(await client.query<{clock:string}>("SELECT business_clock::text AS clock FROM business.datasets WHERE dataset_version=$1 AND status='published'",[context.datasetVersion])).rows[0];
      if(!dataset)throw new DomainError('DATASET_NOT_FOUND','数据集尚未发布');validateWindows(query,dataset.clock);
      const source=type==='refund_reason'?'refund_events':type;
      const watermark=(await client.query<{start:string;end:string;missing:string[]}>('SELECT coverage_start::text AS start,complete_through::text AS "end",ARRAY(SELECT unnest(missing_partitions)::text) AS missing FROM business.source_watermarks WHERE dataset_version=$1 AND store_id=$2 AND source=$3',[context.datasetVersion,context.storeId,source])).rows[0];
      const missing=!watermark||[query.currentWindow,query.baselineWindow].some(w=>watermark.start>w.startDate||watermark.end<w.endDateExclusive||watermark.missing.some(d=>d>=w.startDate && d<w.endDateExclusive));
      if(missing){await client.query('COMMIT');return {status:'missing',coverage:null,baselineCoverage:null,columns:[],rows:[],note:'该信号源不存在或时间覆盖不完整，缺失不等于零值。'};}
      const values:unknown[]=[context.datasetVersion,context.storeId,...utcWindow(query.currentWindow),...utcWindow(query.baselineWindow)];
      const windows="WITH windows(period,start_at,end_at) AS (VALUES ('current',$3::timestamptz,$4::timestamptz),('baseline',$5::timestamptz,$6::timestamptz))";
      let result:SignalResult;
      if(type==='inventory'){
        const skuIds=query.filters.skuId??(await client.query<{sku_id:string}>('SELECT sku_id FROM business.products WHERE dataset_version=$1 AND store_id=$2',[context.datasetVersion,context.storeId])).rows.map(r=>r.sku_id);
        const regions=query.filters.regionId??['east','south','north','west'];values.push(skuIds,regions);
        const rows=(await client.query<{period:string;observed:string;zero:string}>(`${windows} SELECT w.period,COUNT(*) FILTER(WHERE i.is_observed)::text AS observed,COUNT(*) FILTER(WHERE i.is_observed AND i.available_units=0)::text AS zero
          FROM windows w LEFT JOIN business.inventory_hourly i ON i.dataset_version=$1 AND i.store_id=$2 AND i.hour_at>=w.start_at AND i.hour_at<w.end_at AND i.sku_id=ANY($7::text[]) AND i.region_id=ANY($8::text[]) GROUP BY w.period`,values)).rows;
        const stats=(period:string)=>{const row=rows.find(r=>r.period===period),expectedHours=skuIds.length*regions.length*windowDays(query.currentWindow)*24,observedHours=safeInteger(row?.observed??0),zeroHours=safeInteger(row?.zero??0);return {expectedHours,observedHours,zeroHours,coverage:expectedHours?observedHours/expectedHours:0};};
        const current=stats('current'),baseline=stats('baseline');
        result=current.observedHours===0 && baseline.observedHours===0?{status:'missing',coverage:null,baselineCoverage:null,columns:[],rows:[],note:'当前库存池没有任何观测，不能把缺记录当作零库存。'}:
          {status:'success',signal:{type,current,baseline},coverage:current.coverage,baselineCoverage:baseline.coverage,columns:['周期','预期库存池小时','已观测小时','零库存小时'],rows:[['本期',current.expectedHours,current.observedHours,current.zeroHours],['基期',baseline.expectedHours,baseline.observedHours,baseline.zeroHours]],note:'大区共享库存池；小时为 SKU×大区观测数，不推断单渠道独享库存。覆盖不足 95% 不得声称全天未缺货。'};
      }else if(type==='traffic'){
        const channels=query.filters.channelId??['douyin','tmall','jd'],regions=query.filters.regionId??['east','south','north','west'];values.push(channels,regions);
        const rows=(await client.query<{period:string;sessions:string;groups:string;matched:boolean}>(`${windows} SELECT w.period,COALESCE(SUM(t.sessions),0)::text AS sessions,COUNT(t.business_date)::text AS groups,COALESCE(BOOL_AND(t.attribution_version='order-channel-region-v1'),false) AS matched
          FROM windows w LEFT JOIN business.traffic_daily t ON t.dataset_version=$1 AND t.store_id=$2 AND t.business_date>=(w.start_at AT TIME ZONE 'Asia/Shanghai')::date AND t.business_date<(w.end_at AT TIME ZONE 'Asia/Shanghai')::date AND t.channel_id=ANY($7::text[]) AND t.region_id=ANY($8::text[]) GROUP BY w.period`,values)).rows;
        const orders=(await client.query<{period:string;orders:string}>(`${windows} SELECT w.period,COUNT(o.order_id)::text AS orders FROM windows w LEFT JOIN business.orders o ON o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded' AND o.paid_at>=w.start_at AND o.paid_at<w.end_at AND o.channel_id=ANY($7::text[]) AND o.region_id=ANY($8::text[]) GROUP BY w.period`,values)).rows;
        const expected=channels.length*regions.length*windowDays(query.currentWindow);
        const coverage=(period:string)=>Number(rows.find(r=>r.period===period)?.groups??0)/expected;
        const matched=rows.every(r=>r.matched)&&coverage('current')===1&&coverage('baseline')===1;
        const stats=(period:string)=>{const sessions=safeInteger(rows.find(r=>r.period===period)?.sessions??0),paidOrders=safeInteger(orders.find(r=>r.period===period)?.orders??0);return {sessions,paidOrders,conversion:matched&&sessions>0?paidOrders/sessions:null};};
        const current=stats('current'),baseline=stats('baseline');
        result=coverage('current')===0 && coverage('baseline')===0?{status:'missing',coverage:null,baselineCoverage:null,columns:[],rows:[],note:'没有渠道流量观测，不能视为会话数为零。'}:
          {status:'success',signal:{type,current,baseline,attributionMatched:matched,skuAttributionSupported:false},coverage:coverage('current'),baselineCoverage:coverage('baseline'),columns:['周期','会话数','同渠道大区支付订单数','转化率'],rows:[['本期',current.sessions,current.paidOrders,current.conversion],['基期',baseline.sessions,baseline.paidOrders,baseline.conversion]],note:'仅为渠道×大区背景，忽略 SKU 筛选，不支持 SKU 转化或归因；归因口径不匹配或覆盖不足时转化率为 null。'};
      }else if(type==='promotion'){
        values.push(query.filters.channelId??null,query.filters.skuId??null);
        const campaigns=(await client.query<{id:string;start_at:Date;end_at:Date;event_type:string}>(`SELECT campaign_id AS id,start_at,end_at,event_type FROM business.promotion_events
          WHERE dataset_version=$1 AND store_id=$2 AND ((start_at<$4 AND end_at>$3) OR (start_at<$6 AND end_at>$5))
          AND ($7::text[] IS NULL OR channel_id IS NULL OR channel_id=ANY($7)) AND ($8::text[] IS NULL OR sku_id IS NULL OR sku_id=ANY($8)) ORDER BY campaign_id LIMIT 201`,values)).rows;
        if(campaigns.length>200)throw new DomainError('TOO_MANY_GROUPS','活动超过 200 项，请缩小范围');
        const records=campaigns.map(c=>({id:c.id,startAt:c.start_at.toISOString(),endAt:c.end_at.toISOString(),eventType:c.event_type}));
        result={status:'success',signal:{type,campaigns:records},coverage:1,baselineCoverage:1,columns:['活动','开始','结束','事件类型'],rows:records.map(c=>[c.id,c.startAt,c.endAt,c.eventType]),note:'按 SKU/渠道选择匹配活动，包含全范围活动；活动无大区粒度，不支持大区归因。与本期或基期窗口重叠仅为时间佐证，不能推断活动增量或结束造成的销售损失。'};
      }else{
        const conditions:string[]=[];
        for(const [key,column]of [['channelId','o.channel_id'],['regionId','o.region_id'],['skuId','i.sku_id']]as const)if(query.filters[key]){values.push(query.filters[key]);conditions.push(`${column}=ANY($${values.length}::text[])`);}
        // $5/$6 are explicitly referenced to keep typed parameter positions consistent.
        const rows=(await client.query<{code:string;amount:string;events:string}>(`${windows} SELECT COALESCE(r.reason_code,'unknown') AS code,SUM(r.refund_amount_cents)::text AS amount,COUNT(*)::text AS events FROM windows w
          JOIN business.refund_events r ON r.succeeded_at>=w.start_at AND r.succeeded_at<w.end_at
          JOIN business.order_items i USING(dataset_version,store_id,order_item_id) JOIN business.orders o USING(dataset_version,store_id,order_id)
          WHERE w.period='current' AND r.dataset_version=$1 AND r.store_id=$2 AND r.status='succeeded' ${conditions.length?'AND '+conditions.join(' AND '):''} GROUP BY code ORDER BY code LIMIT 201`,values)).rows;
        if(rows.length>200)throw new DomainError('TOO_MANY_GROUPS','退款原因超过分组限制');
        const reasons=rows.map(r=>({code:r.code,amountCents:safeInteger(r.amount),events:safeInteger(r.events)}));
        const total=reasons.reduce((s,r)=>s+BigInt(r.amountCents),0n),unknown=reasons.find(r=>r.code==='unknown')?.amountCents??0;
        result={status:'success',signal:{type,reasons,missingShare:total?unknown/safeInteger(total):null},coverage:1,baselineCoverage:1,columns:['原因码','成功退款金额（分）','退款事件数'],rows:reasons.map(r=>[r.code,r.amountCents,r.events]),note:'按退款成功时间；事件数不是退款订单数；原因码只表示客户选择分类，不证明产品质量事故。'};
      }
      await watcher.stop();signal?.throwIfAborted();await client.query('COMMIT');return result;
    }catch(error){await watcher?.stop();await client.query('ROLLBACK');signal?.throwIfAborted();throw error;}finally{client.release();}
  }
}
