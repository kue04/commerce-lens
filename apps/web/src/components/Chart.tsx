import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  AriaComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import type { Report, Overview } from "../lib/types";
import { metricValue, money, number } from "../lib/format";
echarts.use([
  BarChart,
  LineChart,
  LegendComponent,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  AriaComponent,
  SVGRenderer,
]);

export function OverviewTrend({ data, unit }: { data: Overview; unit: "fen" | "units" }) {
  const option: EChartsCoreOption = {
    textStyle: { fontFamily: '"Microsoft YaHei", sans-serif', color: "#617064" },
    grid: { left: 75, right: 24, top: 45, bottom: 45 },
    legend: { top: 0, data: ["本期", "配对基期"] },
    tooltip: { trigger: "axis", valueFormatter: (value: unknown) => metricValue(typeof value === "number" ? value : null, unit) },
    xAxis: { type: "category", data: data.trend.points.map((point) => point.date), axisLabel: { hideOverlap: true, formatter: (value: string) => value.slice(5) } },
    yAxis: { type: "value", name: unit === "fen" ? "元" : "件", axisLabel: { formatter: (value: number) => number(unit === "fen" ? value / 100 : value) }, splitLine: { lineStyle: { color: "#e9ece7" } } },
    series: (["current", "baseline"] as const).map((key) => ({
      name: key === "current" ? "本期" : "配对基期", type: "line", connectNulls: false, smooth: false,
      symbol: key === "current" ? "circle" : "emptyRect", symbolSize: 5,
      lineStyle: { type: key === "current" ? "solid" : "dashed", width: 2 },
      itemStyle: { color: key === "current" ? "#378f72" : "#9e6e42" },
      data: data.trend.points.map((point) => point.comparison[key]),
    })),
  };
  return <Chart option={option} className="overview-trend-chart" label="近30天日趋势，本期实线与配对基期虚线；缺失值断开。下方提供完整日期、数值和可用性的数据表。"/>;
}

function Chart({
  option,
  label,
  className = "",
}: {
  option: EChartsCoreOption;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    chart.setOption({
      ...option,
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 220,
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);
  return (
    <div
      ref={ref}
      className={`chart ${className}`}
      role="img"
      aria-label={label}
    />
  );
}
export function ContributionChart({ report }: { report: Report }) {
  const [compact, setCompact] = useState(() => innerWidth < 768);
  useEffect(() => {
    const query = matchMedia("(max-width: 767px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const max = Math.max(
    ...report.contributors.map((c) => Math.abs(c.delta ?? 0)),
    report.unit === "fen" ? 100 : 1,
  );
  const option: EChartsCoreOption = {
    textStyle: {
      fontFamily: '"Microsoft YaHei", sans-serif',
      color: "#6c7771",
      fontSize: 12,
    },
    grid: {
      left: compact ? 76 : 100,
      right: compact ? 58 : 80,
      top: 16,
      bottom: 36,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: number) => metricValue(value, report.unit, true),
    },
    xAxis: {
      type: "value",
      min:
        Math.min(0, ...report.contributors.map((c) => c.delta ?? 0)) * 1.25 -
        max * 0.02,
      max:
        Math.max(0, ...report.contributors.map((c) => c.delta ?? 0)) * 1.8 +
        max * 0.05,
      splitNumber: compact ? 3 : 6,
      axisLine: { show: true, lineStyle: { color: "#dce2dc" } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "#e9ece7" } },
      axisLabel: {
        fontSize: 11,
        hideOverlap: true,
        formatter: (value: number) => {
          const display = report.unit === "fen" ? value / 100 : value;
          return compact && Math.abs(display) >= 10000
            ? `${number(display / 10000)}万`
            : number(display);
        },
      },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: report.contributors.map((c) => c.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        align: "right",
        width: compact ? 64 : 85,
        overflow: "truncate",
        fontSize: compact ? 12 : 14,
        margin: compact ? 12 : 18,
      },
    },
    series: [
      {
        type: "bar",
        barWidth: 25,
        data: report.contributors.map((c) => ({
          value: c.delta ?? 0,
          itemStyle: { color: (c.delta ?? 0) < 0 ? "#c76e5d" : "#378f72" },
          label: {
            show: true,
            position:
              (c.delta ?? 0) < 0 ? (compact ? "insideLeft" : "left") : "right",
            distance: compact ? 5 : 12,
            color:
              (c.delta ?? 0) < 0
                ? compact
                  ? "#ffffff"
                  : "#b95545"
                : "#287a5b",
            fontSize: compact ? 10 : 14,
            formatter: () =>
              report.unit === "fen"
                ? money(c.delta, true)
                : metricValue(c.delta, report.unit, true),
          },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#7c8780", type: "solid", width: 1 },
          data: [{ xAxis: 0 }],
          label: { show: false },
        },
      },
    ],
  };
  return (
    <Chart
      option={option}
      className="contribution-chart"
      label={`商品贡献图。${report.contributors.map((c) => `${c.label} ${metricValue(c.delta, report.unit, true)}`).join("；")}。可切换明细表。`}
    />
  );
}
