import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
export const MetricIdSchema = Type.Union([
  Type.Literal('paid_amount'), Type.Literal('paid_orders'), Type.Literal('sold_units'),
  Type.Literal('refund_amount'), Type.Literal('net_receipts'), Type.Literal('aov'),
]);
export type MetricId = Static<typeof MetricIdSchema>;
export const DimensionSchema = Type.Union([
  Type.Literal('none'), Type.Literal('channel'), Type.Literal('region'), Type.Literal('sku'), Type.Literal('category'),
]);
export type Dimension = Static<typeof DimensionSchema>;
const WindowSchema = Type.Object({ startDate: Type.String(), endDateExclusive: Type.String() }, { additionalProperties: false });
const IdList = Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 20, uniqueItems: true });
export const QuerySpecSchema = Type.Object({
  metricId: MetricIdSchema,
  currentWindow: WindowSchema,
  baselineWindow: WindowSchema,
  filters: Type.Object({ channelId: Type.Optional(IdList), regionId: Type.Optional(IdList), skuId: Type.Optional(IdList) }, { additionalProperties: false }),
  groupBy: DimensionSchema,
  topN: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
}, { additionalProperties: false });
export type QuerySpec = Static<typeof QuerySpecSchema>;
export type DateWindow = Static<typeof WindowSchema>;
export type QueryContext = Readonly<{ storeId: string; datasetVersion: string }>;
export type Comparison = { current: number | null; baseline: number | null; delta: number | null; changeRate: number | null };
export type Contributor = Comparison & { key: string; isOther: boolean; share: number | null };
export type Catalog = { channelId: string[]; regionId: string[]; skuId: string[] };

export function parseQuerySpec(input: unknown): QuerySpec {
  if (!Value.Check(QuerySpecSchema, input)) throw new DomainError('INVALID_QUERY', 'QuerySpec 不符合受控查询契约');
  return structuredClone({ ...input, topN: input.topN ?? 10 });
}

export function safeInteger(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') throw new DomainError('UNSAFE_INTEGER', '无效整数');
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) throw new DomainError('UNSAFE_INTEGER', '无效整数字符串');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new DomainError('UNSAFE_INTEGER', '金额或数量超出安全整数范围');
  return number;
}
export function sumIntegers(values: number[]): number {
  return safeInteger(values.reduce((sum, value) => sum + BigInt(safeInteger(value)), 0n));
}
