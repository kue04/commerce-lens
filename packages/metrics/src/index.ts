import { DomainError, type DateWindow, type MetricId, type QuerySpec } from '../../contracts/src/index.js';

export const METRIC_VERSION = '1.0.0';
export const metrics = {
  paid_amount: { name: '支付金额', unit: 'CNY_cent', additive: true, sources: ['orders', 'order_items'], timeField: 'paid_at', entry: 'primary' },
  paid_orders: { name: '支付订单数', unit: 'order', additive: false, sources: ['orders', 'order_items'], timeField: 'paid_at', entry: 'auxiliary' },
  sold_units: { name: '支付件数', unit: 'unit', additive: true, sources: ['orders', 'order_items'], timeField: 'paid_at', entry: 'primary' },
  refund_amount: { name: '成功退款金额', unit: 'CNY_cent', additive: true, sources: ['orders', 'order_items', 'refund_events'], timeField: 'succeeded_at', entry: 'primary' },
  net_receipts: { name: '净收款', unit: 'CNY_cent', additive: true, sources: ['orders', 'order_items', 'refund_events'], timeField: 'paid_at / succeeded_at', entry: 'internal' },
  aov: { name: '客单价', unit: 'CNY_cent_per_order', additive: false, sources: ['orders', 'order_items'], timeField: 'paid_at', entry: 'auxiliary' },
} as const satisfies Record<MetricId, object>;

export function parseDate(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DomainError('INVALID_DATE', '需要 ISO 自然日');
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date || date < '2000-01-01' || date > '2100-12-31') {
    throw new DomainError('INVALID_DATE', `无效或超出支持范围的日期：${date}`);
  }
  return time;
}
export function shiftDate(date: string, days: number): string {
  return new Date(parseDate(date) + days * 86_400_000).toISOString().slice(0, 10);
}
export function utcWindow(window: DateWindow): [string, string] {
  parseDate(window.startDate); parseDate(window.endDateExclusive);
  return [new Date(`${window.startDate}T00:00:00+08:00`).toISOString(), new Date(`${window.endDateExclusive}T00:00:00+08:00`).toISOString()];
}
export function windowDays(window: DateWindow): number {
  const days = (parseDate(window.endDateExclusive) - parseDate(window.startDate)) / 86_400_000;
  if (days < 1 || days > 31) throw new DomainError('INVALID_WINDOW', '窗口须为 1—31 个自然日');
  return days;
}
export function validateWindows(spec: QuerySpec, businessClock: string): void {
  parseDate(businessClock);
  if (windowDays(spec.currentWindow) !== windowDays(spec.baselineWindow)) throw new DomainError('UNEQUAL_WINDOWS', '比较窗口天数必须相同');
  if (spec.currentWindow.startDate < spec.baselineWindow.endDateExclusive && spec.baselineWindow.startDate < spec.currentWindow.endDateExclusive) {
    throw new DomainError('OVERLAPPING_WINDOWS', '比较窗口不得重叠');
  }
  if (spec.currentWindow.endDateExclusive > businessClock || spec.baselineWindow.endDateExclusive > businessClock) {
    throw new DomainError('INCOMPLETE_DAY', '仅分析演示业务时钟之前的完整自然日');
  }
}
export function defaultWindows(clock: string, period: 'yesterday' | 'last7days' | 'thisWeek' = 'yesterday') {
  parseDate(clock);
  const count = period === 'last7days' ? 7 : period === 'thisWeek' ? (new Date(`${clock}T00:00:00Z`).getUTCDay() + 6) % 7 : 1;
  if (!count) throw new DomainError('INCOMPLETE_DAY', '本周尚无完整自然日，请选择上周或昨天');
  const currentWindow = { startDate: shiftDate(clock, -count), endDateExclusive: clock };
  return { currentWindow, baselineWindow: { startDate: shiftDate(currentWindow.startDate, -7), endDateExclusive: shiftDate(clock, -7) } };
}
