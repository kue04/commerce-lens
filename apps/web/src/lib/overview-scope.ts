import type { DatasetProfile, Overview, QuerySpec } from "./types";
import { shiftDate } from "./presentation";

export type OverviewScope = {
  days: 1 | 7 | 30;
  metricId: Overview["trend"]["metricId"];
  filters: QuerySpec["filters"];
};
export const filterKeys = ["channelId", "regionId", "skuId"] as const;
const params = { channelId: "channel", regionId: "region", skuId: "sku" };

export function scopeFromUrl(url: URL): OverviewScope {
  const days = Number(url.searchParams.get("days"));
  const metric = url.searchParams.get("metric");
  const filters: QuerySpec["filters"] = {};
  for (const key of filterKeys) {
    const values = [...new Set(url.searchParams.getAll(params[key]))];
    if (values.length) filters[key] = values;
  }
  return { days: days === 7 || days === 30 ? days : 1,
    metricId: metric === "refund_amount" || metric === "sold_units" ? metric : "paid_amount", filters };
}

export function writeScope(url: URL, scope: OverviewScope): void {
  url.searchParams.set("days", String(scope.days));
  url.searchParams.set("metric", scope.metricId);
  for (const key of filterKeys) {
    url.searchParams.delete(params[key]);
    for (const value of scope.filters[key] ?? []) url.searchParams.append(params[key], value);
  }
}

export function scopeError(scope: OverviewScope, profile: DatasetProfile): string | null {
  for (const key of filterKeys) {
    const values = scope.filters[key];
    if (values && (values.length > 20 || values.some((value) => !profile.filters[key].some((item) => item.value === value))))
      return "URL 中的筛选不属于当前版本授权字典或超过 20 项，请重新选择筛选。";
  }
  return null;
}

export function overviewQuery(clock: string, scope: OverviewScope): QuerySpec {
  const start = shiftDate(clock, -scope.days);
  const offset = scope.days === 1 ? 7 : scope.days;
  return { metricId: scope.metricId,
    currentWindow: { startDate: start, endDateExclusive: clock },
    baselineWindow: { startDate: shiftDate(start, -offset), endDateExclusive: shiftDate(clock, -offset) },
    filters: scope.filters, groupBy: "sku", topN: 10 };
}
