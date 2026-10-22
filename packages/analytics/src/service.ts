import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DomainError, parseQuerySpec, safeInteger, sumIntegers, type Catalog, type Comparison, type QueryContext, type QuerySpec } from '../../contracts/src/index.js';
import { METRIC_VERSION, metrics, validateWindows } from '../../metrics/src/index.js';
import { compare, contributions } from './compare.js';
import { compileQuery } from './query-compiler.js';

type AggregateRow = { period: 'current' | 'baseline'; key: string; paid: string; units: string; orders: string; refund: string };
type Watermark = { source: string; coverage_start: string; complete_through: string; missing_partitions: string[] };
export class AnalyticsService {
  constructor(private readonly pool: Pool) {}

  async analyze(input: unknown, context: QueryContext) {
    const spec = parseQuerySpec(input);
    // Context is constructed by the server, never parsed from model arguments.
    if (!context.storeId || !context.datasetVersion) throw new DomainError('INVALID_CONTEXT', '缺少服务端访问范围');
    if (spec.groupBy !== 'none' && !metrics[spec.metricId].additive) throw new DomainError('NON_ADDITIVE_METRIC', '比率和去重订单数不能做可加贡献分解');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '3s'");
      await client.query("SELECT set_config('lens.store',$1,true),set_config('lens.dataset',$2,true)",[context.storeId,context.datasetVersion]);
      const dataset = await client.query<{ clock: string; schema_version: string; is_synthetic: boolean }>(
        "SELECT business_clock::text AS clock,schema_version,is_synthetic FROM business.datasets WHERE dataset_version=$1 AND status='published'",[context.datasetVersion]);
      if (!dataset.rows[0]) throw new DomainError('DATASET_NOT_FOUND','数据集不存在或尚未发布');
      validateWindows(spec,dataset.rows[0].clock);
      const quality=await this.checkQuality(client,spec,context);
      await this.validateCatalog(client,spec,context);
      const totalQuery=compileQuery(spec,context,false), totalRows=await client.query<AggregateRow>(totalQuery);
      const total=compare(this.value(totalRows.rows.find(r=>r.period==='current'),spec),this.value(totalRows.rows.find(r=>r.period==='baseline'),spec),spec.metricId!=='aov');
      const groupedQuery=spec.groupBy==='none'?null:compileQuery(spec,context,true);
      const groupedRows=groupedQuery ? (await client.query<AggregateRow>(groupedQuery)).rows : [];
      const keys=[...new Set(groupedRows.map(r=>r.key))];
      const contributors=groupedQuery ? contributions(keys.map(key=>({key,
        current:this.value(groupedRows.find(r=>r.key===key && r.period==='current'),spec)!,
        baseline:this.value(groupedRows.find(r=>r.key===key && r.period==='baseline'),spec)!,
      })),total,spec.topN!) : [];
      await client.query('COMMIT');
      const result={comparison:total,contributors};
      const resultHash=createHash('sha256').update(JSON.stringify(result)).digest('hex');
      return {
        ...result,
        evidence:{
          metricId:spec.metricId,unit:metrics[spec.metricId].unit,querySpec:spec,datasetVersion:context.datasetVersion,
          snapshotId:context.datasetVersion,metricVersion:METRIC_VERSION,schemaVersion:dataset.rows[0].schema_version,
          queryTemplateIds:[totalQuery.queryTemplateId,...(groupedQuery?[groupedQuery.queryTemplateId]:[])],
          result,resultHash,sourceCoverage:quality,createdAt:new Date().toISOString(),isSynthetic:dataset.rows[0].is_synthetic,
        },
      };
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally {client.release();}
  }

  private value(row: AggregateRow | undefined, spec: QuerySpec): number | null {
    const paid=safeInteger(row?.paid??0), units=safeInteger(row?.units??0), orders=safeInteger(row?.orders??0), refund=safeInteger(row?.refund??0);
    switch(spec.metricId) {
      case 'paid_amount':return paid;
      case 'sold_units':return units;
      case 'paid_orders':return orders;
      case 'refund_amount':return refund;
      case 'net_receipts':return sumIntegers([paid,-refund]);
      case 'aov':return orders===0?null:paid/orders;
    }
  }
  private async checkQuality(client: PoolClient, spec: QuerySpec, context:QueryContext) {
    const result=await client.query<Watermark>(`SELECT source,coverage_start::text,complete_through::text,
      ARRAY(SELECT unnest(missing_partitions)::text) AS missing_partitions FROM business.source_watermarks
      WHERE dataset_version=$1 AND store_id=$2`,[context.datasetVersion,context.storeId]);
    for(const source of metrics[spec.metricId].sources) {
      const watermark=result.rows.find(r=>r.source===source);
      for(const window of [spec.currentWindow,spec.baselineWindow]) {
        if(!watermark || watermark.coverage_start>window.startDate || watermark.complete_through<window.endDateExclusive || watermark.missing_partitions.some(day=>day>=window.startDate && day<window.endDateExclusive)) {
          throw new DomainError('INSUFFICIENT_DATA',`${source} 在 ${window.startDate} 至 ${window.endDateExclusive} 覆盖不完整，禁止生成变化结论`);
        }
      }
    }
    return result.rows.filter(r=>(metrics[spec.metricId].sources as readonly string[]).includes(r.source));
  }
  private async validateCatalog(client:PoolClient,spec:QuerySpec,context:QueryContext) {
    // Fixed business dictionary for synthetic single-store data; SKU catalog remains version-scoped.
    const catalog:Catalog={channelId:['douyin','tmall','jd','unknown'],regionId:['east','south','north','west','unknown'],skuId:[]};
    if(spec.filters.skuId) catalog.skuId=(await client.query<{sku_id:string}>('SELECT sku_id FROM business.products WHERE dataset_version=$1 AND store_id=$2',[context.datasetVersion,context.storeId])).rows.map(r=>r.sku_id);
    for(const key of ['channelId','regionId','skuId'] as const) if(spec.filters[key]?.some(value=>!catalog[key].includes(value))) {
      throw new DomainError('UNKNOWN_FILTER',`${key} 包含未知或未授权值`);
    }
  }
}
