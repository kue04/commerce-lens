export function number(value: number | null, digits = 0): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("zh-CN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value);
}
export function money(
  value: number | null,
  signed = false,
  digits = 0,
): string {
  if (value === null) return "—";
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}¥${number(Math.abs(value) / 100, digits)}`;
}
export function rate(value: number | null, signed = false): string {
  if (value === null) return "不可计算";
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${number(Math.abs(value) * 100, 1)}%`;
}
export function metricValue(
  value: number | null,
  unit: "fen" | "units",
  signed = false,
): string {
  if (unit === "fen") return money(value, signed, 2);
  return value === null
    ? "—"
    : `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${number(Math.abs(value))} 件`;
}
export function dateLabel(date: string): string {
  return date.replaceAll("-", " / ");
}
