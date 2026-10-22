import { DomainError, safeInteger, sumIntegers, type Comparison, type Contributor } from '../../contracts/src/index.js';

export function compare(current: number | null, baseline: number | null, integer = true): Comparison {
  if (current === null || baseline === null) return { current, baseline, delta: null, changeRate: null };
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) throw new DomainError('INVALID_NUMBER', '计算结果必须有限');
  const delta = integer ? sumIntegers([safeInteger(current), -safeInteger(baseline)]) : current - baseline;
  return { current, baseline, delta, changeRate: baseline === 0 ? null : delta / baseline };
}

export function contributions(rows: { key: string; current: number; baseline: number }[], total: Comparison, topN: number): Contributor[] {
  if (rows.length > 200) throw new DomainError('TOO_MANY_GROUPS', '超过 200 个分组，请缩小范围');
  if (!Number.isInteger(topN) || topN < 1 || topN > 20) throw new DomainError('INVALID_TOP_N', 'topN 必须为 1—20');
  if (sumIntegers(rows.map(r => r.current)) !== total.current || sumIntegers(rows.map(r => r.baseline)) !== total.baseline) {
    throw new DomainError('CONSERVATION_FAILED', '分组金额与总量不守恒');
  }
  const sorted = rows.map(row => ({ key: row.key, ...compare(row.current, row.baseline), isOther: false }))
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const selected = sorted.slice(0, topN);
  const remaining = sorted.slice(topN);
  if (remaining.length) selected.push({ key: '其他', isOther: true, ...compare(sumIntegers(remaining.map(r => r.current!)), sumIntegers(remaining.map(r => r.baseline!))) });
  return selected.map(row => ({ ...row, share: total.delta === 0 ? null : row.delta! / total.delta! }));
}
