import type { HistoryItem, PhaseName } from "./types";
import { money, rate } from "./format";

export function phaseIndex(name: PhaseName): number {
  if (["received", "interpreting"].includes(name)) return 0;
  if (["checking_data", "comparing"].includes(name)) return 1;
  return name === "decomposing" ? 2 : 3;
}
export function evidenceCell(
  value: string | number | null,
  column: string,
): string {
  if (value === null) return "缺失";
  if (typeof value === "number" && column.includes("（分）"))
    return money(value, column.includes("变化"), 2);
  if (typeof value === "number" && /率|份额/.test(column))
    return rate(value, true);
  return String(value);
}

export function recentSessions(history: HistoryItem[]) {
  const sessions = new Map<string, HistoryItem & { reportCount: number }>();
  for (const report of history) {
    const existing = sessions.get(report.sessionId);
    if (existing) existing.reportCount++;
    else sessions.set(report.sessionId, { ...report, reportCount: 1 });
  }
  return [...sessions.values()];
}

