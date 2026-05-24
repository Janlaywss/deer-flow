"use client";

import * as echarts from "echarts";
import { BarChart3Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/core/i18n/hooks";
import {
  useTokenUsageDashboard,
  type TokenUsageDashboard,
  type TokenUsageRange,
} from "@/core/token-usage";
import { cn } from "@/lib/utils";

type TokenUsageChartOption = echarts.EChartsOption;

type TooltipItem = {
  dataIndex?: number;
  marker?: string;
  seriesName?: string;
  value?: number | string | null;
};

const MODEL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--muted-foreground)",
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDateLabel(date: string, range: TokenUsageRange): string {
  const [, month, day] = date.split("-");
  if (range === 7) return month && day ? `${month}/${day}` : date;
  return day ?? date;
}

function getModelColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePercentOrNumber(value: string, percentScale = 1): number | null {
  const trimmed = value.trim();
  const number = Number.parseFloat(trimmed);
  if (!Number.isFinite(number)) return null;
  return trimmed.endsWith("%") ? (number / 100) * percentScale : number;
}

function parseHue(value: string): number | null {
  const trimmed = value.trim();
  const number = Number.parseFloat(trimmed);
  if (!Number.isFinite(number)) return null;
  if (trimmed.endsWith("turn")) return number * 360;
  if (trimmed.endsWith("rad")) return (number * 180) / Math.PI;
  if (trimmed.endsWith("grad")) return number * 0.9;
  return number;
}

function linearSrgbToByte(value: number): number {
  const srgb =
    value <= 0.0031308
      ? value * 12.92
      : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return Math.round(clamp(srgb, 0, 1) * 255);
}

function oklchToRgb(color: string): string | null {
  const match = /^oklch\((.*)\)$/i.exec(color.trim());
  if (!match) return null;

  const [channels = "", alphaChannel] = match[1]!.split("/");
  const [lightnessChannel, chromaChannel, hueChannel] = channels
    .trim()
    .split(/\s+/);
  if (!lightnessChannel || !chromaChannel || !hueChannel) return null;

  const lightness = parsePercentOrNumber(lightnessChannel);
  const chroma = parsePercentOrNumber(chromaChannel, 0.4);
  const hue = parseHue(hueChannel);
  const alpha = alphaChannel
    ? parsePercentOrNumber(alphaChannel)
    : undefined;
  if (
    lightness === null ||
    chroma === null ||
    hue === null ||
    alpha === null
  ) {
    return null;
  }

  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);

  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const red = linearSrgbToByte(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
  );
  const green = linearSrgbToByte(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  );
  const blue = linearSrgbToByte(
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );

  if (alpha === undefined || alpha >= 1) {
    return `rgb(${red}, ${green}, ${blue})`;
  }
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
}

function normalizeEchartsColor(color: string): string {
  return oklchToRgb(color) ?? color;
}

function resolveThemeColor(element: HTMLElement, color: string): string {
  const match = /^var\((--[^,)]+)(?:,[^)]+)?\)$/.exec(color.trim());
  if (!match) return normalizeEchartsColor(color);
  const computedColor =
    getComputedStyle(element).getPropertyValue(match[1]!).trim() || color;
  return normalizeEchartsColor(computedColor);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function toTooltipItems(params: unknown): TooltipItem[] {
  return (Array.isArray(params) ? params : [params]).filter(
    (item): item is TooltipItem => typeof item === "object" && item !== null,
  );
}

function tooltipValue(item: TooltipItem): number {
  const value = Number(item.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function TokenUsageDashboardPage() {
  const { t } = useI18n();
  const [range, setRange] = useState<TokenUsageRange>(7);
  const { data, isLoading, error } = useTokenUsageDashboard(range);

  useEffect(() => {
    document.title = `${t.tokenUsageDashboard.title} - ${t.pages.appName}`;
  }, [t.pages.appName, t.tokenUsageDashboard.title]);

  return (
    <div className="flex size-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">
            {t.tokenUsageDashboard.title}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {t.tokenUsageDashboard.description}
          </p>
        </div>
        <div className="bg-muted inline-flex rounded-md p-1">
          {([7, 30] as const).map((days) => (
            <Button
              key={days}
              size="sm"
              variant={range === days ? "secondary" : "ghost"}
              className={cn("h-8", range === days && "bg-background shadow-xs")}
              onClick={() => setRange(days)}
            >
              {days === 7
                ? t.tokenUsageDashboard.last7Days
                : t.tokenUsageDashboard.last30Days}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {isLoading ? (
          <TokenUsageSkeleton />
        ) : error || !data ? (
          <Alert variant="destructive">
            <AlertTitle>{t.tokenUsageDashboard.loadErrorTitle}</AlertTitle>
            <AlertDescription>
              {t.tokenUsageDashboard.loadErrorDescription}
            </AlertDescription>
          </Alert>
        ) : (
          <TokenUsageDashboard data={data} range={range} />
        )}
      </div>
    </div>
  );
}

function TokenUsageDashboard({
  data,
  range,
}: {
  data: TokenUsageDashboard;
  range: TokenUsageRange;
}) {
  const { t } = useI18n();
  const hasUsage = data.total_tokens > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricBlock
          label={t.tokenUsageDashboard.totalTokens}
          value={formatNumber(data.total_tokens)}
        />
        <MetricBlock
          label={t.tokenUsageDashboard.inputTokens}
          value={formatNumber(data.total_input_tokens)}
        />
        <MetricBlock
          label={t.tokenUsageDashboard.outputTokens}
          value={formatNumber(data.total_output_tokens)}
        />
      </div>

      <section className="rounded-lg border">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-medium">
              {t.tokenUsageDashboard.dailyByModel}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t.tokenUsageDashboard.rangeLabel(data.start_date, data.end_date)}
            </p>
          </div>
          <Badge variant="secondary">
            {t.tokenUsageDashboard.modelCount(data.models.length)}
          </Badge>
        </div>

        {hasUsage ? (
          <StackedBarChart data={data} range={range} />
        ) : (
          <div className="flex h-72 flex-col items-center justify-center gap-3 px-5 text-center">
            <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
              <BarChart3Icon className="text-muted-foreground h-7 w-7" />
            </div>
            <div>
              <p className="font-medium">{t.tokenUsageDashboard.emptyTitle}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t.tokenUsageDashboard.emptyDescription}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-5 py-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StackedBarChart({
  data,
  range,
}: {
  data: TokenUsageDashboard;
  range: TokenUsageRange;
}) {
  const { t } = useI18n();
  const chartElementRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);

  useEffect(() => {
    const element = chartElementRef.current;
    if (!element) return;

    const chart = echarts.init(element, undefined, { renderer: "canvas" });
    chartInstanceRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeRevision((revision) => revision + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    const element = chartElementRef.current;
    if (!chart || !element) return;

    const axisColor = resolveThemeColor(element, "var(--muted-foreground)");
    const borderColor = resolveThemeColor(element, "var(--border)");
    const foregroundColor = resolveThemeColor(element, "var(--foreground)");
    const backgroundColor = resolveThemeColor(element, "var(--background)");
    const colors = data.models.map((_, index) =>
      resolveThemeColor(element, getModelColor(index)),
    );
    const dates = data.buckets.map((bucket) => bucket.date);
    const categories = data.buckets.map((bucket) =>
      formatDateLabel(bucket.date, range),
    );
    const series: echarts.BarSeriesOption[] = data.models.map(
      (model, index) => ({
        name: model,
        type: "bar",
        stack: "tokens",
        barMaxWidth: range === 7 ? 48 : 28,
        emphasis: { focus: "series" },
        itemStyle: { color: colors[index] },
        data: data.buckets.map((bucket) => bucket.models[model]?.tokens ?? 0),
      }),
    );

    const option: TokenUsageChartOption = {
      backgroundColor: "transparent",
      color: colors,
      animationDuration: 250,
      grid: {
        top: 54,
        right: 18,
        bottom: 44,
        left: 8,
        containLabel: true,
      },
      legend: {
        top: 0,
        left: 0,
        right: 0,
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: {
          color: axisColor,
          fontSize: 12,
        },
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor,
        borderColor,
        borderWidth: 1,
        textStyle: {
          color: foregroundColor,
          fontSize: 12,
        },
        axisPointer: {
          type: "shadow",
          shadowStyle: {
            color: "rgba(127, 127, 127, 0.08)",
          },
        },
        formatter: (params: unknown) => {
          const items = toTooltipItems(params);
          const date = dates[items[0]?.dataIndex ?? 0] ?? "";
          const visibleItems = items.filter((item) => tooltipValue(item) > 0);
          const total = visibleItems.reduce(
            (sum, item) => sum + tooltipValue(item),
            0,
          );
          const lines = visibleItems
            .map((item) => {
              const marker = item.marker ?? "";
              const name = escapeHtml(item.seriesName ?? "");
              return `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:180px;"><span>${marker}${name}</span><strong>${formatNumber(tooltipValue(item))}</strong></div>`;
            })
            .join("");
          return `<div style="display:flex;flex-direction:column;gap:6px;"><strong>${escapeHtml(date)}</strong>${lines}<div style="border-top:1px solid ${borderColor};padding-top:6px;display:flex;justify-content:space-between;gap:16px;"><span>${escapeHtml(t.tokenUsageDashboard.totalTokens)}</span><strong>${formatNumber(total)}</strong></div></div>`;
        },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: axisColor,
          fontSize: 11,
          interval: 0,
        },
        axisLine: { lineStyle: { color: borderColor } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: axisColor,
          formatter: (value: string | number) => formatNumber(Number(value)),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: borderColor } },
      },
      series,
    };

    chart.setOption(option, true);
    chart.resize();
  }, [data, range, t.tokenUsageDashboard.totalTokens, themeRevision]);

  return (
    <div className="overflow-x-auto px-5 py-5">
      <div
        ref={chartElementRef}
        aria-label={t.tokenUsageDashboard.dailyByModel}
        className="h-80 w-full"
        style={{ minWidth: range === 7 ? 640 : 1040 }}
      />
    </div>
  );
}

function TokenUsageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border px-5 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border px-5 py-5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2 h-4 w-64" />
        <div className="mt-8 flex h-72 items-end gap-3">
          {Array.from({ length: 14 }).map((_, index) => (
            <Skeleton
              key={index}
              className="w-8 rounded-t"
              style={{ height: `${80 + (index % 5) * 34}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
