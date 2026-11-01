import { type QueryContext, type QuerySpec } from '../../contracts/src/index.js';
import { utcWindow } from '../../metrics/src/index.js';

// Only server-owned identifiers are interpolated. All external values are bound.
const dimensions = { none: "'total'::text", channel: 'o.channel_id', region: 'o.region_id', sku: 'i.sku_id', category: 'i.category_at_sale' } as const;
export function compileDailyQuery(spec:QuerySpec,context:QueryContext,startDate:string,endDateExclusive:string){
  const values:unknown[]=[context.datasetVersion,context.storeId,...utcWindow({startDate,endDateExclusive})];
  const conditions:string[]=[];
  for(const [key,column] of [['channelId','o.channel_id'],['regionId','o.region_id'],['skuId','i.sku_id']] as const)if(spec.filters[key]){values.push(spec.filters[key]);conditions.push(`${column}=ANY($${values.length}::text[])`);}
  const filter=conditions.length?` AND ${conditions.join(' AND ')}`:'';
  return {values,queryTemplateId:'overview-daily-v1:payments-refunds',text:`
    WITH daily AS (
      SELECT (o.paid_at AT TIME ZONE 'Asia/Shanghai')::date AS date,SUM(i.paid_amount_cents) AS paid,SUM(i.quantity) AS units,0::numeric AS refund
      FROM business.orders o JOIN business.order_items i USING(dataset_version,store_id,order_id)
      WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded' AND o.paid_at>=$3::timestamptz AND o.paid_at<$4::timestamptz ${filter} GROUP BY 1
      UNION ALL
      SELECT (r.succeeded_at AT TIME ZONE 'Asia/Shanghai')::date,0::numeric,0::numeric,SUM(r.refund_amount_cents)
      FROM business.refund_events r JOIN business.order_items i USING(dataset_version,store_id,order_item_id) JOIN business.orders o USING(dataset_version,store_id,order_id)
      WHERE r.dataset_version=$1 AND r.store_id=$2 AND r.status='succeeded' AND r.succeeded_at>=$3::timestamptz AND r.succeeded_at<$4::timestamptz ${filter} GROUP BY 1
    ) SELECT date::text,SUM(paid)::text AS paid,SUM(units)::text AS units,SUM(refund)::text AS refund FROM daily GROUP BY date ORDER BY date`};
}
export function compileQuery(spec: QuerySpec, context: QueryContext, grouped: boolean) {
  const current = utcWindow(spec.currentWindow), baseline = utcWindow(spec.baselineWindow);
  const values: unknown[] = [context.datasetVersion, context.storeId, ...current, ...baseline];
  const conditions: string[] = [];
  for (const [key, column] of [['channelId', 'o.channel_id'], ['regionId', 'o.region_id'], ['skuId', 'i.sku_id']] as const) {
    if (spec.filters[key]) { values.push(spec.filters[key]); conditions.push(`${column} = ANY($${values.length}::text[])`); }
  }
  const filter = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const dimension = dimensions[grouped ? spec.groupBy : 'none'];
  const payments = `SELECT w.period, ${dimension} AS key, SUM(i.paid_amount_cents) AS paid, SUM(i.quantity) AS units,
      COUNT(DISTINCT o.order_id) AS orders, 0::numeric AS refund
    FROM windows w JOIN business.orders o ON o.paid_at >= w.start_at AND o.paid_at < w.end_at
    JOIN business.order_items i USING (dataset_version, store_id, order_id)
    WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded' ${filter}
    GROUP BY w.period, key`;
  const refunds = `SELECT w.period, ${dimension} AS key, 0::numeric AS paid, 0::numeric AS units, 0::bigint AS orders,
      SUM(r.refund_amount_cents) AS refund
    FROM windows w JOIN business.refund_events r ON r.succeeded_at >= w.start_at AND r.succeeded_at < w.end_at
    JOIN business.order_items i USING (dataset_version, store_id, order_item_id)
    JOIN business.orders o USING (dataset_version, store_id, order_id)
    WHERE r.dataset_version=$1 AND r.store_id=$2 AND r.status='succeeded' ${filter}
    GROUP BY w.period, key`;
  const source = spec.metricId === 'refund_amount' ? refunds : spec.metricId === 'net_receipts' ? `${payments} UNION ALL ${refunds}` : payments;
  return {
    text: `WITH windows(period,start_at,end_at) AS (VALUES ('current',$3::timestamptz,$4::timestamptz),('baseline',$5::timestamptz,$6::timestamptz)),
      source AS (${source})
      SELECT period,key,SUM(paid)::text AS paid,SUM(units)::text AS units,SUM(orders)::text AS orders,SUM(refund)::text AS refund
      FROM source GROUP BY period,key ORDER BY key,period LIMIT 403`,
    values,
    queryTemplateId: `aggregate-v1:${spec.metricId}:${grouped ? spec.groupBy : 'none'}`,
  };
}
