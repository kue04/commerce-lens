import type { Pool } from 'pg';
import { DomainError,safeInteger,type QueryContext } from '../../contracts/src/index.js';
import { CONTRACT_VERSION,type DatasetProfileDTO,type SourceProfileDTO } from '../../contracts/src/http.js';
import { METRIC_VERSION,metrics,shiftDate } from '../../metrics/src/index.js';

const sources=['orders','order_items','refund_events','inventory','traffic','promotion'] as const;
const grains={orders:'订单',order_items:'订单行',refund_events:'订单行退款事件',inventory:'SKU × 大区库存池 × 小时',traffic:'渠道 × 大区 × 自然日',promotion:'活动生效范围'};
const channelLabels:Record<string,string>={douyin:'抖音',tmall:'天猫',jd:'京东',unknown:'未知'};
const regionLabels:Record<string,string>={east:'华东',south:'华南',north:'华北',west:'西部',unknown:'未知'};
const definitions={
  paid_amount:'按支付时间统计支付成功订单的订单行实付金额，单位为整数分；不扣退款。',
  refund_amount:'按退款成功时间统计成功退款事件的金额，单位为整数分；允许跨支付期退款，支付与退款分别聚合。',
  sold_units:'按支付时间统计支付成功订单的订单行购买件数；不扣退款件数。',
};

// Identifiers are fixed here; the route constructs context after authorization.
const sourceSql=`
  SELECT 'orders' AS source,count(*)::text AS count,min(paid_at AT TIME ZONE 'Asia/Shanghai')::date::text AS first,max(paid_at AT TIME ZONE 'Asia/Shanghai')::date::text AS last FROM business.orders WHERE dataset_version=$1 AND store_id=$2
  UNION ALL SELECT 'order_items',count(*)::text,min(o.paid_at AT TIME ZONE 'Asia/Shanghai')::date::text,max(o.paid_at AT TIME ZONE 'Asia/Shanghai')::date::text FROM business.order_items i JOIN business.orders o USING(dataset_version,store_id,order_id) WHERE i.dataset_version=$1 AND i.store_id=$2
  UNION ALL SELECT 'refund_events',count(*)::text,min(succeeded_at AT TIME ZONE 'Asia/Shanghai')::date::text,max(succeeded_at AT TIME ZONE 'Asia/Shanghai')::date::text FROM business.refund_events WHERE dataset_version=$1 AND store_id=$2
  UNION ALL SELECT 'inventory',count(*)::text,min(hour_at AT TIME ZONE 'Asia/Shanghai')::date::text,max(hour_at AT TIME ZONE 'Asia/Shanghai')::date::text FROM business.inventory_hourly WHERE dataset_version=$1 AND store_id=$2
  UNION ALL SELECT 'traffic',count(*)::text,min(business_date)::text,max(business_date)::text FROM business.traffic_daily WHERE dataset_version=$1 AND store_id=$2
  UNION ALL SELECT 'promotion',count(*)::text,min(start_at AT TIME ZONE 'Asia/Shanghai')::date::text,max(end_at AT TIME ZONE 'Asia/Shanghai')::date::text FROM business.promotion_events WHERE dataset_version=$1 AND store_id=$2`;

export class DatasetProfileService {
  constructor(private readonly pool:Pool){}
  async profile(context:QueryContext):Promise<DatasetProfileDTO>{
    if(!context.storeId||!context.datasetVersion)throw new DomainError('INVALID_CONTEXT','缺少服务端访问范围');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='3s'");
      await client.query("SELECT set_config('lens.store',$1,true),set_config('lens.dataset',$2,true)",[context.storeId,context.datasetVersion]);
      const args=[context.datasetVersion,context.storeId];
      const dataset=(await client.query<{clock:string;published_at:Date}>("SELECT business_clock::text AS clock,published_at FROM business.datasets WHERE dataset_version=$1 AND status='published'",[context.datasetVersion])).rows[0];
      const products=(await client.query<{sku_id:string;name:string;category:string}>('SELECT sku_id,name,category FROM business.products WHERE dataset_version=$1 AND store_id=$2 ORDER BY sku_id',args)).rows;
      if(!dataset||!products.length)throw new DomainError('DATASET_NOT_FOUND','数据集不存在或不属于当前店铺');
      const actual=(await client.query<{source:string;count:string;first:string|null;last:string|null}>(sourceSql,args)).rows;
      const watermarks=(await client.query<{source:string;start:string;end:string;missing:string[];checked_at:Date}>(`SELECT source,coverage_start::text AS start,complete_through::text AS end,ARRAY(SELECT unnest(missing_partitions)::text) AS missing,checked_at FROM business.source_watermarks WHERE dataset_version=$1 AND store_id=$2`,args)).rows;
      const profiles:SourceProfileDTO[]=sources.map(source=>{
        const row=actual.find(r=>r.source===source)!,mark=watermarks.find(r=>r.source===source);
        const partial=mark&&(mark.missing.length>0||mark.end<dataset.clock);
        const contiguousThrough=mark?[mark.end,...mark.missing.filter(day=>day>=mark.start&&day<mark.end)].sort()[0]!:null;
        return {source,grain:grains[source],rowCount:safeInteger(row.count),actualStartDate:row.first,actualEndDate:row.last,
          status:!mark?'missing':partial?'partial':'available',coverageStart:mark?.start??null,completeThrough:mark?.end??null,lastCompleteDate:mark&&contiguousThrough!==null&&contiguousThrough>mark.start?shiftDate(contiguousThrough,-1):null,
          missingPartitions:mark?.missing??[],checkedAt:mark?.checked_at.toISOString()??null,reason:!mark?'未发布该数据源的覆盖检查，行数为零不代表业务零值。':partial?'存在缺失分区或完整水位早于业务时钟；可查询范围须通过指标质量门禁。':null};
      });
      const dimensions=(await client.query<{kind:'channelId'|'regionId';value:string}>(`
        SELECT 'channelId' AS kind,channel_id AS value FROM business.orders WHERE dataset_version=$1 AND store_id=$2
        UNION SELECT 'channelId',channel_id FROM business.traffic_daily WHERE dataset_version=$1 AND store_id=$2
        UNION SELECT 'channelId',channel_id FROM business.promotion_events WHERE dataset_version=$1 AND store_id=$2 AND channel_id IS NOT NULL
        UNION SELECT 'regionId',region_id FROM business.orders WHERE dataset_version=$1 AND store_id=$2
        UNION SELECT 'regionId',region_id FROM business.traffic_daily WHERE dataset_version=$1 AND store_id=$2
        UNION SELECT 'regionId',region_id FROM business.inventory_hourly WHERE dataset_version=$1 AND store_id=$2 ORDER BY kind,value`,args)).rows;
      const channelId=dimensions.filter(r=>r.kind==='channelId').map(r=>({value:r.value,label:channelLabels[r.value]??r.value}));
      const regionId=dimensions.filter(r=>r.kind==='regionId').map(r=>({value:r.value,label:regionLabels[r.value]??r.value}));
      const core=profiles.filter(p=>['orders','order_items','refund_events'].includes(p.source));
      const coverageStart=core.some(p=>p.status==='missing')?null:core.map(p=>p.coverageStart!).sort().at(-1)!;
      const end=coverageStart?core.flatMap(p=>[p.completeThrough!,...p.missingPartitions.filter(day=>day>=coverageStart&&day<p.completeThrough!)]).sort()[0]!:null;
      const completeThrough=end!==null&&coverageStart!==null&&end>coverageStart?end:null;
      const count=(source:typeof sources[number])=>profiles.find(p=>p.source===source)!.rowCount;
      const result:DatasetProfileDTO={contractVersion:CONTRACT_VERSION,dataset:{version:context.datasetVersion,storeName:'禾味食品演示店',synthetic:true,businessClock:dataset.clock,updatedAt:dataset.published_at.toISOString(),timezone:'Asia/Shanghai'},publishedAt:dataset.published_at.toISOString(),coverageStart,completeThrough,lastCompleteDate:completeThrough?shiftDate(completeThrough,-1):null,
        counts:{orders:count('orders'),orderItems:count('order_items'),refundEvents:count('refund_events'),inventoryHours:count('inventory'),trafficDays:count('traffic'),promotionEvents:count('promotion'),skus:products.length,channels:channelId.length,regions:regionId.length},sources:profiles,
        metrics:(['paid_amount','refund_amount','sold_units'] as const).map(metricId=>({metricId,label:metrics[metricId].name,unit:metricId==='sold_units'?'units':'fen',metricVersion:METRIC_VERSION,definition:definitions[metricId],timeField:metrics[metricId].timeField,requiredSources:[...metrics[metricId].sources]})),
        filters:{skuId:products.map(p=>({value:p.sku_id,label:p.name,category:p.category})),channelId,regionId}};
      await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
