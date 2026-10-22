import { DomainError,parseQuerySpec,type QuerySpec } from '../../contracts/src/index.js';
import { defaultWindows } from '../../metrics/src/index.js';

// This path is explicitly labelled deterministic. Agent mode uses a model parser instead.
export function deterministicIntent(question:string,clock:string,confirmed?:QuerySpec,previous?:QuerySpec):QuerySpec|null {
  if(confirmed)return supported(confirmed);
  if(/利润|毛利|客单价|净收款|退款率/.test(question))throw new DomainError('UNSUPPORTED_INTENT','当前接口支持支付金额、退款金额和支付件数');
  if(/今天/.test(question))throw new DomainError('INCOMPLETE_DAY','今天不是完整自然日，请选择昨天或提供完整日期窗口');
  if(!/支付金额|销售额|退款|销量|件数|只看|按.*拆|按.*分|排除/.test(question))return null;
  if(!previous && !/昨天|近\s*7\s*天|本周/.test(question))return null;
  const query=structuredClone(previous??{metricId:'paid_amount',...defaultWindows(clock),filters:{},groupBy:'sku',topN:10}) as QuerySpec;
  if(/退款/.test(question))query.metricId='refund_amount';else if(/销量|件数/.test(question))query.metricId='sold_units';else if(/支付金额|销售额/.test(question))query.metricId='paid_amount';
  if(/昨天|近\s*7\s*天|本周/.test(question))Object.assign(query,defaultWindows(clock,/近\s*7\s*天/.test(question)?'last7days':/本周/.test(question)?'thisWeek':'yesterday'));
  for(const [label,id]of [['华东','east'],['华南','south'],['华北','north'],['西部','west']]as const)if(question.includes(label))query.filters.regionId=[id];
  if(/全地区|全部大区/.test(question))delete query.filters.regionId;
  if(/按渠道/.test(question))query.groupBy='channel';
  if(/按地区/.test(question))query.groupBy='region';
  if(/按商品|按SKU/i.test(question))query.groupBy='sku';
  if(/排除|剔除/.test(question))return null; // Inclusive-only QuerySpec needs explicit authorized selection.
  return supported(query);
}
export function supported(input:unknown){const query=parseQuerySpec(input);if(!['paid_amount','refund_amount','sold_units'].includes(query.metricId))throw new DomainError('UNSUPPORTED_INTENT','当前接口支持支付金额、退款金额和支付件数');return query;}
