import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { getAgentColorHex } from '@vibetime/core'
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
} from 'echarts/types/dist/echarts'
import { useAtomValue } from 'jotai'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useResolvedColorScheme } from '@/appearance'
import { type EChartsCoreOption, echarts } from '@/charts/echarts'
import { PageShell } from '@/components/PageShell'
import { getAgentTheme, StackedProgress } from '@/components/StackedProgress'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import {
  calendarDayLabels,
  calendarMonthLabels,
  durationUnit,
  formatDurationFull,
  formatDurationSummary,
  formatPeriodLabel,
  formatShortDate,
  localizeDurationRangeLabel,
  weekdayLabels,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import type { HistorySummary, TopProjectRow } from '../../../shared/ipc-types'
import { HISTORY_PERIODS } from '../../../shared/ipc-types'
import { getChartThemeName, getChartTokens } from '../charts/theme'
import { useI18n } from '../i18n'
import { clearActiveHistoryPeriod, historySummariesAtom, refreshHistorySummary } from '../store'

function DashboardPanel({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col pt-1', className)}>
      <header className="mb-2.5 px-1">
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">{description}</p>
        )}
      </header>
      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-sm shadow-black/[0.01]">
        <div className="flex h-full flex-col px-5 pt-4 pb-5">{children}</div>
      </div>
    </section>
  )
}

const PERIODS = HISTORY_PERIODS
type SortKey = 'project' | 'total' | 'turns' | 'lastActive' | 'focusTurns' | 'median'

type EnrichedProjectRow = TopProjectRow & { focusTurns: number; median: number }
type ChartTokens = ReturnType<typeof getChartTokens>
type TFunction = ReturnType<typeof useI18n>['t']
type ChartAppearance = {
  chartThemeName: string
  locale: string
  tokens: ChartTokens
}
type ColorPalette = readonly [string, ...string[]]

const baseAxisLabelStyle = { fontSize: 11, fontFamily: 'SN Pro' }

function formatPeriodTotalLabel(days: number, locale: string, t: TFunction): string {
  return locale === 'zh-CN'
    ? `${days}${t('history.dayTotalSuffix')}`
    : `${days}-${t('history.dayTotalSuffix')}`
}

function axisLabelStyle(tokens: ChartTokens) {
  return { ...baseAxisLabelStyle, color: tokens.axisLabel }
}

function splitLineStyle(tokens: ChartTokens) {
  return { color: tokens.splitLine, width: 1 }
}

function tooltipExtraCss(tokens: ChartTokens) {
  return `box-shadow: 0 8px 24px ${tokens.tooltipShadow}; border-radius: 8px;`
}

const calendarHeatmapEmphasis = {
  itemStyle: {
    borderRadius: 2,
    color: 'inherit',
    opacity: 0.75,
  },
} as const

function parseHexColor(color: string) {
  const hex = color.replace('#', '')
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function interpolateHexColor(from: string, to: string, amount: number) {
  const start = parseHexColor(from)
  const end = parseHexColor(to)
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount)
  return {
    r: mix(start.r, end.r),
    g: mix(start.g, end.g),
    b: mix(start.b, end.b),
  }
}

function heatmapPaletteColor(palette: ColorPalette, value: number, max: number, alpha: number) {
  if (palette.length === 1 || max <= 0) {
    const color = parseHexColor(palette[0])
    return `rgba(${color.r},${color.g},${color.b},${alpha})`
  }
  const normalized = Math.max(0, Math.min(1, value / max))
  const position = normalized * (palette.length - 1)
  const index = Math.min(palette.length - 2, Math.floor(position))
  const color = interpolateHexColor(
    palette[index] ?? palette[0] ?? '#000000',
    palette[index + 1] ?? palette[index] ?? palette[0] ?? '#000000',
    position - index,
  )
  return `rgba(${color.r},${color.g},${color.b},${alpha})`
}

function renderHourlyHeatmapCell(
  tokens: ChartTokens,
  max: number,
  _params: CustomSeriesRenderItemParams,
  api: CustomSeriesRenderItemAPI,
) {
  const point = api.coord([api.value(0), api.value(1)])
  const rawSize = api.size?.([1, 1])
  const size: [number, number] = Array.isArray(rawSize)
    ? [Number(rawSize[0] ?? 0), Number(rawSize[1] ?? 0)]
    : [Number(rawSize ?? 0), Number(rawSize ?? 0)]
  const gap = 1
  const width = Math.max(0, Number(size[0]) - gap)
  const height = Math.max(0, Number(size[1]) - gap)
  const total = Number(api.value(2))
  const radius = 4

  return {
    type: 'rect',
    shape: {
      x: Number(point[0]) - width / 2,
      y: Number(point[1]) - height / 2,
      width,
      height,
      r: radius,
    },
    style: {
      fill: heatmapPaletteColor(tokens.hourlyHeatmap, total, max, 1),
    },
    emphasis: {
      style: {
        fill: heatmapPaletteColor(tokens.hourlyHeatmap, total, max, 0.75),
      },
    },
  }
}

function formatDelta(ratio: number | null, t: TFunction): string {
  if (ratio === null) return t('history.noPriorPeriod')
  const pct = Math.round(ratio * 100)
  return `${pct >= 0 ? '+' : ''}${pct}% ${t('history.vsPrevious')}`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function sumTrendDay(day: HistorySummary['trends'][number]): number {
  return Object.values(day.projects).reduce((sum, value) => sum + value, 0)
}

function formatHourWindow(weekday: number, hour: number, locale: string): string {
  const labels = weekdayLabels(locale)
  return `${labels[weekday] ?? '-'} ${String(hour).padStart(2, '0')}:00`
}

function durationSummaryParts(seconds: number): Array<{ value: number; unit: 'h' | 'm' | 's' }> {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return [{ value: whole, unit: 's' }]

  const totalMinutes = Math.round(whole / 60)
  if (totalMinutes < 60) return [{ value: totalMinutes, unit: 'm' }]

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0
    ? [
        { value: hours, unit: 'h' },
        { value: minutes, unit: 'm' },
      ]
    : [{ value: hours, unit: 'h' }]
}

function DurationSummaryFlow({ seconds, locale }: { seconds: number; locale: string }) {
  return (
    <NumberFlowGroup>
      <span className="inline-flex max-w-full items-baseline overflow-hidden tabular-nums">
        {durationSummaryParts(seconds).map((part) => (
          <span className="inline-flex items-baseline" key={part.unit}>
            <NumberFlow locales={locale} value={part.value} />
            <span>{durationUnit(part.unit, locale)}</span>
          </span>
        ))}
      </span>
    </NumberFlowGroup>
  )
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const pos = (values.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = values[base + 1]
  if (next === undefined) return values[base] ?? 0
  return (values[base] ?? 0) + rest * (next - (values[base] ?? 0))
}

function useChart(
  ref: React.RefObject<HTMLDivElement | null>,
  options: EChartsCoreOption | null,
  themeName: string,
) {
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, themeName)
    chartRef.current = chart
    if (optionsRef.current) chart.setOption(optionsRef.current, true)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chartRef.current = null
      chart.dispose()
    }
  }, [ref, themeName])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !options) return
    chart.setOption(options, true)
  }, [options])
}

function CalendarHeatmap({
  chartThemeName,
  locale,
  summary,
  tokens,
}: ChartAppearance & { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const values = useMemo(
    () => summary.calendar.map((day) => [day.date, day.total]),
    [summary.calendar],
  )
  const max = Math.max(1, ...values.map(([, total]) => Number(total)))
  const option = useMemo<EChartsCoreOption>(
    () => ({
      stateAnimation: { duration: 0 },
      tooltip: {
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: { value: [string, number] }) =>
          `<div style="font-size:12px;color:${tokens.tooltipMuted}">${params.value[0]}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${formatDurationFull(params.value[1], locale)}</div>`,
      },
      visualMap: {
        min: 0,
        max,
        show: false,
        inRange: { color: tokens.heatmap },
      },
      calendar: {
        top: 22,
        left: 36,
        right: 8,
        bottom: 4,
        cellSize: [11, 11],
        range: [summary.calendar[0]?.date, summary.calendar[summary.calendar.length - 1]?.date],
        splitLine: { show: false },
        itemStyle: {
          color: tokens.calendarFill,
          borderWidth: 2,
          borderColor: tokens.calendarBorder,
          borderRadius: 2,
        },
        yearLabel: { show: false },
        monthLabel: {
          color: tokens.axisLabel,
          fontSize: 11,
          margin: 7,
          nameMap: calendarMonthLabels(locale),
        },
        dayLabel: {
          color: tokens.weakAxisLabel,
          firstDay: 1,
          fontSize: 10,
          margin: 7,
          nameMap: calendarDayLabels(locale),
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: values,
          emphasis: calendarHeatmapEmphasis,
          itemStyle: { borderRadius: 2 },
        },
      ],
    }),
    [locale, max, summary.calendar, tokens, values],
  )
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[138px] w-full" />
}

function TrendChart({
  chartThemeName,
  locale,
  summary,
  tokens,
  t,
}: ChartAppearance & { summary: HistorySummary; t: TFunction }) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    return {
      color: [...tokens.seriesPalette],
      tooltip: {
        trigger: 'axis',
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
        formatter: (
          params: Array<{ marker: string; seriesName: string; value: number; axisValue: string }>,
        ) => {
          const rows = params
            .filter((item) => item.value > 0)
            .map(
              (item) =>
                `<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:4px">${item.marker}<span style="color:${tokens.tooltipRow}">${item.seriesName}</span><span style="font-weight:600;color:${tokens.text}">${formatDurationFull(item.value, locale)}</span></div>`,
            )
            .join('')
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${params[0]?.axisValue ?? ''}</div>${rows || `<div style="margin-top:4px;color:${tokens.tooltipMuted}">${t('history.noActivity')}</div>`}`
        },
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemHeight: 8,
        itemWidth: 14,
        textStyle: labels,
      },
      grid: { left: 34, right: 10, top: 34, bottom: 26 },
      xAxis: {
        type: 'category',
        boundaryGap: true,
        data: summary.trends.map((day) => day.date.slice(5)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...labels,
          hideOverlap: true,
          interval: Math.max(0, Math.floor(summary.trends.length / 8)),
        },
      },
      yAxis: {
        type: 'value',
        minInterval: 60,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...labels,
          formatter: (value: number) => formatDurationSummary(value, locale),
        },
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      series: summary.trendProjects.map((project, index) => ({
        name: project,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 18,
        barMinWidth: summary.trends.length > 120 ? 1 : 4,
        itemStyle: {
          borderRadius: index === summary.trendProjects.length - 1 ? [3, 3, 0, 0] : 0,
        },
        emphasis: { focus: 'series' },
        data: summary.trends.map((day) => day.projects[project] ?? 0),
      })),
    }
  }, [locale, summary.trendProjects, summary.trends, t, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[260px] w-full" />
}

function ProjectShareChart({
  chartThemeName,
  locale,
  summary,
  tokens,
}: ChartAppearance & { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const rows = useMemo(
    () => [...summary.topProjects].sort((a, b) => a.total - b.total).slice(-6),
    [summary.topProjects],
  )
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    return {
      color: [tokens.text],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0]
          if (!item) return ''
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${item.name}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${formatDurationFull(item.value, locale)} · ${pct}%</div>`
        },
      },
      grid: { left: 88, right: 18, top: 8, bottom: 18 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...labels,
          formatter: (value: number) => formatDurationSummary(value, locale),
        },
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.project),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...labels, width: 76, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: rows.map((row, index) => ({
            value: row.total,
            itemStyle: {
              color: tokens.seriesPalette[index % tokens.seriesPalette.length],
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 10,
        },
      ],
    }
  }, [locale, rows, tokens, total])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[220px] w-full" />
}

function HourlyActivityHeatmap({
  chartThemeName,
  locale,
  summary,
  tokens,
}: ChartAppearance & { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const max = Math.max(1, ...summary.hourlyMatrix.map((cell) => cell.total))
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    const dayLabels = weekdayLabels(locale)
    return {
      stateAnimation: { duration: 0 },
      tooltip: {
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: { value: [number, number, number] }) => {
          const [hour, weekday, total] = params.value
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${dayLabels[weekday]} · ${String(hour).padStart(2, '0')}:00</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${formatDurationFull(total, locale)}</div>`
        },
      },
      grid: { left: 34, right: 14, top: 10, bottom: 28 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...labels, interval: 2 },
      },
      yAxis: {
        type: 'category',
        data: dayLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: labels,
      },
      series: [
        {
          type: 'custom',
          coordinateSystem: 'cartesian2d',
          data: summary.hourlyMatrix.map((cell) => [cell.hour, cell.weekday, cell.total]),
          renderItem: (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) =>
            renderHourlyHeatmapCell(tokens, max, params, api),
        },
      ],
    }
  }, [locale, max, summary.hourlyMatrix, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[220px] w-full" />
}

function FocusDurationChart({
  chartThemeName,
  locale,
  summary,
  tokens,
  t,
}: ChartAppearance & { summary: HistorySummary; t: TFunction }) {
  const ref = useRef<HTMLDivElement>(null)
  const buckets = useMemo(() => {
    const ranges = [
      { label: '<5m', min: 0, max: 5 * 60 },
      { label: '5-15m', min: 5 * 60, max: 15 * 60 },
      { label: '15-30m', min: 15 * 60, max: 30 * 60 },
      { label: '30-60m', min: 30 * 60, max: 60 * 60 },
      { label: '1h+', min: 60 * 60, max: Number.POSITIVE_INFINITY },
    ]
    return ranges.map((range) => {
      const turns = summary.turnDurations.filter(
        (turn) => turn.duration >= range.min && turn.duration < range.max,
      )
      return {
        label: localizeDurationRangeLabel(range.label, locale),
        count: turns.length,
        total: turns.reduce((sum, turn) => sum + turn.duration, 0),
      }
    })
  }, [locale, summary.turnDurations])
  const totalTurns = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    return {
      color: [tokens.turnBucket.standard],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: Array<{ dataIndex: number; name: string }>) => {
          const item = params[0]
          const bucket = item ? buckets[item.dataIndex] : undefined
          if (!item || !bucket) return ''
          const pct = totalTurns > 0 ? Math.round((bucket.count / totalTurns) * 100) : 0
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${item.name}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${bucket.count} ${t('history.turns')} · ${pct}%</div><div style="margin-top:2px;color:${tokens.tooltipMuted}">${formatDurationFull(bucket.total, locale)} ${t('history.total')}</div>`
        },
      },
      grid: { left: 34, right: 12, top: 18, bottom: 28 },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => bucket.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: labels,
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: labels,
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      series: [
        {
          type: 'bar',
          data: buckets.map((bucket, index) => ({
            value: bucket.count,
            itemStyle: {
              color:
                index === 0
                  ? tokens.turnBucket.short
                  : index >= 3
                    ? tokens.turnBucket.long
                    : tokens.turnBucket.standard,
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 34,
          label: {
            show: true,
            position: 'top',
            color: tokens.axisLabel,
            fontSize: 11,
            formatter: ({ value }: { value: number }) => String(value),
          },
        },
      ],
    }
  }, [buckets, locale, t, tokens, totalTurns])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[220px] w-full" />
}

function AgentContributionBars({
  locale,
  summary,
  t,
}: {
  locale: string
  summary: HistorySummary
  t: TFunction
}) {
  const rows = useMemo(
    () => summary.projectAgentTotals.filter((project) => project.total > 0).slice(0, 6),
    [summary.projectAgentTotals],
  )
  const agentTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const project of rows) {
      for (const agent of project.agents) {
        totals.set(agent.agent, (totals.get(agent.agent) ?? 0) + agent.total)
      }
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="py-8 text-[13px] text-muted-foreground">{t('history.noAgentActivity')}</div>
    )
  }

  return (
    <div className="flex min-h-[220px] flex-col justify-between gap-4 pt-2">
      <div className="space-y-4">
        {rows.map((project) => (
          <div key={project.project}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="truncate text-[13px] font-medium">{project.project}</p>
              <p className="shrink-0 font-heading tracking-tight text-[12px] text-muted-foreground tabular-nums">
                {formatDurationSummary(project.total, locale)}
              </p>
            </div>
            <div className="px-1">
              <StackedProgress
                segments={project.agents.map((agent, index) => {
                  const agentPct = project.total > 0 ? (agent.total / project.total) * 100 : 0
                  return {
                    id: agent.agent,
                    label: agent.agent,
                    value: agent.total,
                    colorHex: getAgentColorHex(agent.agent, index),
                    tooltip: `${agent.agent}: ${formatDurationSummary(agent.total, locale)} (${Math.round(agentPct)}%)`,
                  }
                })}
                total={project.total}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/40 pt-4 px-1">
        {agentTotals.map(([agent, total], index) => {
          const theme = getAgentTheme(agent, index)
          return (
            <div className="flex items-center gap-2 text-[12px]" key={agent}>
              <span className={cn('font-medium transition-colors', theme.text)}>{agent}</span>
              <span className="mx-1 text-muted-foreground/40">·</span>
              <span className="font-heading tracking-tight tabular-nums text-muted-foreground/70">
                {formatDurationSummary(total, locale)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContextSwitchChart({
  chartThemeName,
  summary,
  tokens,
  t,
}: Omit<ChartAppearance, 'locale'> & { summary: HistorySummary; t: TFunction }) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    const data = summary.trends.map((day) => {
      const activeProjects = Object.entries(day.projects)
        .filter(([, duration]) => duration > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
      return {
        value: activeProjects.length,
        date: day.date.slice(5),
        projects: activeProjects,
      }
    })

    return {
      color: [tokens.seriesPalette[0]],
      tooltip: {
        trigger: 'axis',
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
        formatter: (
          params: Array<{ name: string; data: { value: number; projects: string[] } }>,
        ) => {
          const item = params[0]
          if (!item) return ''
          const projectCount = item.data.value
          const projects: string[] = item.data.projects || []
          const limit = 6
          const projectList = projects
            .slice(0, limit)
            .map(
              (p) =>
                `<div style="color:${tokens.text};opacity:0.85;font-size:12px;margin-top:3px;">${p}</div>`,
            )
            .join('')
          const more =
            projects.length > limit
              ? `<div style="color:${tokens.tooltipMuted};font-size:11px;margin-top:3px;">+ ${projects.length - limit} more</div>`
              : ''
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${item.name}</div><div style="margin-top:2px;margin-bottom:6px;font-size:13px;font-weight:600;color:${tokens.text}">${projectCount} ${t('history.project')}</div>${projectList}${more}`
        },
      },
      grid: { left: 34, right: 10, top: 20, bottom: 26 },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.date),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...labels, interval: Math.max(0, Math.floor(data.length / 8)) },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: labels,
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      series: [
        {
          type: 'line',
          step: 'middle',
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: tokens.seriesPalette[0] },
          lineStyle: { width: 3 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${tokens.seriesPalette[0]}40` },
                { offset: 1, color: `${tokens.seriesPalette[0]}00` },
              ],
            },
          },
          data: data.map((d) => ({
            value: d.value,
            projects: d.projects,
          })),
        },
      ],
    }
  }, [summary.trends, t, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[220px] w-full" />
}

function ProjectEngagementChart({
  chartThemeName,
  locale,
  summary,
  tokens,
  t,
}: ChartAppearance & { summary: HistorySummary; t: TFunction }) {
  const ref = useRef<HTMLDivElement>(null)

  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    const rawBuckets = ['< 2m', '2-15m', '15-30m', '30-60m', '1-2h', '> 2h']
    const buckets = rawBuckets.map((b) => localizeDurationRangeLabel(b, locale))
    const topProjects = summary.topProjects
      .slice(0, 6)
      .map((p) => p.project)
      .reverse()

    const data: { value: [number, number, number] }[] = []

    topProjects.forEach((project, yIndex) => {
      const turns = summary.turnDurations.filter((t) => t.project === project && t.duration > 0)
      const counts = [0, 0, 0, 0, 0, 0]
      turns.forEach((turn) => {
        const min = turn.duration / 60
        if (min < 2) counts[0]++
        else if (min < 15) counts[1]++
        else if (min < 30) counts[2]++
        else if (min < 60) counts[3]++
        else if (min < 120) counts[4]++
        else counts[5]++
      })

      counts.forEach((count, xIndex) => {
        if (count > 0) {
          data.push({ value: [xIndex, yIndex, count] })
        }
      })
    })

    const maxCount = Math.max(...data.map((d) => d.value[2]), 1)

    return {
      color: [tokens.seriesPalette[1]],
      tooltip: {
        trigger: 'item',
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: { value: [number, number, number] }) => {
          const count = params.value[2]
          const bucket = buckets[params.value[0]]
          const project = topProjects[params.value[1]]
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${project}</div>
            <div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${bucket}: ${count} ${t('history.turns')}</div>`
        },
      },
      grid: { left: 80, right: 20, top: 20, bottom: 26 },
      xAxis: {
        type: 'category',
        data: buckets,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: labels,
        splitLine: { show: true, lineStyle: splitLineStyle(tokens) },
      },
      yAxis: {
        type: 'category',
        data: topProjects,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...labels, width: 70, overflow: 'truncate' },
        splitLine: { show: true, lineStyle: splitLineStyle(tokens) },
      },
      series: [
        {
          type: 'scatter',
          data: data,
          symbolSize: (val: [number, number, number]) => {
            return 8 + (val[2] / maxCount) * 22
          },
          itemStyle: {
            color: tokens.seriesPalette[1],
            opacity: 0.8,
          },
        },
      ],
    }
  }, [summary.turnDurations, summary.topProjects, t, tokens, locale])

  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[220px] w-full" />
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  const Icon = asc ? ArrowUpIcon : ArrowDownIcon
  return (
    <Icon
      aria-hidden
      className={cn('ml-1 inline size-3 transition-opacity', active ? 'opacity-100' : 'opacity-0')}
    />
  )
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string
  value: React.ReactNode
  detail: React.ReactNode
}) {
  return (
    <div className="flex flex-col justify-between rounded-[18px] border border-border/40 bg-card/40 p-5 shadow-sm shadow-black/[0.01]">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <div className="font-heading text-[26px] font-semibold tracking-tight text-foreground">
          {value}
        </div>
      </div>
      <div className="mt-4 truncate text-[12px] text-muted-foreground">{detail}</div>
    </div>
  )
}

function InsightBar({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-4 px-1">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="flex flex-col">
          <p className="text-[12px] font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-[15px] font-medium text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

export default function History() {
  const colorScheme = useResolvedColorScheme()
  const { locale, t } = useI18n()
  const [periodDays, setPeriodDays] = useState<HistorySummary['periodDays']>(30)
  const summaries = useAtomValue(historySummariesAtom)
  const exactSummary = summaries[periodDays] ?? null
  const [visibleSummary, setVisibleSummary] = useState<HistorySummary | null>(null)
  const summary = exactSummary ?? visibleSummary
  const isLoadingPeriod = summary !== null && exactSummary === null
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortAsc, setSortAsc] = useState(false)
  const chartThemeName = getChartThemeName(colorScheme)
  const tokens = getChartTokens(colorScheme)

  useEffect(() => {
    if (exactSummary) setVisibleSummary(exactSummary)
  }, [exactSummary])

  useEffect(() => {
    let alive = true
    setError(null)
    refreshHistorySummary(periodDays)
      .then((result) => {
        if (!alive) return
        if (result && !result.ok) setError(result.error)
      })
      .catch((err) => {
        if (alive) setError(String(err))
      })
    return () => {
      alive = false
      clearActiveHistoryPeriod()
    }
  }, [periodDays])

  const sortedRows = useMemo(() => {
    if (!summary) return []
    const durationsByProject = new Map<string, number[]>()
    for (const turn of summary.turnDurations) {
      if (turn.duration > 0) {
        const values = durationsByProject.get(turn.project) ?? []
        values.push(turn.duration)
        durationsByProject.set(turn.project, values)
      }
    }
    const rows: EnrichedProjectRow[] = summary.topProjects.map((project) => {
      const turnValues = (durationsByProject.get(project.project) ?? []).sort((a, b) => a - b)
      const focusTurns = turnValues.filter((d) => d >= 25 * 60).length
      const median = quantile(turnValues, 0.5)
      return { ...project, focusTurns, median }
    })
    return rows.sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortKey === 'project') return a.project.localeCompare(b.project) * dir
      const aValue = a[sortKey] ?? 0
      const bValue = b[sortKey] ?? 0
      return (Number(aValue) - Number(bValue)) * dir
    })
  }, [sortAsc, sortKey, summary])

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((value) => !value)
    else {
      setSortKey(key)
      setSortAsc(key === 'project')
    }
  }

  const stats = useMemo(() => {
    if (!summary) return null
    const periodTotal = summary.trends.reduce((sum, day) => sum + sumTrendDay(day), 0)
    const activeDays = summary.trends.filter((day) => sumTrendDay(day) > 0).length
    const bestDay = summary.trends.reduce(
      (best, day) => {
        const total = sumTrendDay(day)
        return total > best.total ? { date: day.date, total } : best
      },
      { date: '', total: 0 },
    )
    const turnDurations = summary.turnDurations
      .map((turn) => turn.duration)
      .filter((duration) => duration > 0)
      .sort((a, b) => a - b)
    const turnCount = turnDurations.length
    const medianTurn = quantile(turnDurations, 0.5)
    const p75Turn = quantile(turnDurations, 0.75)
    const focusTurns = turnDurations.filter((duration) => duration >= 25 * 60).length
    const shortTurnRate =
      turnCount > 0 ? turnDurations.filter((duration) => duration < 5 * 60).length / turnCount : 0
    const peakHour = summary.hourlyMatrix.reduce(
      (best, cell) => (cell.total > best.total ? cell : best),
      { weekday: 0, hour: 0, total: 0 },
    )
    const topProject = summary.topProjects[0]
    const topProjectShare = topProject && periodTotal > 0 ? topProject.total / periodTotal : 0
    return {
      activeDays,
      averageActiveDay: activeDays > 0 ? periodTotal / activeDays : 0,
      bestDay,
      focusTurns,
      medianTurn,
      p75Turn,
      peakHour,
      periodTotal,
      shortTurnRate,
      topProject,
      topProjectShare,
      turnCount,
    }
  }, [summary])

  const insights = useMemo(() => {
    if (!summary || !stats) return null
    const activeCalendarDays = summary.calendar.filter((day) => day.total > 0).length
    let currentStreak = 0
    for (const day of [...summary.calendar].reverse()) {
      if (day.total <= 0) break
      currentStreak += 1
    }
    const bestCalendarDay = summary.calendar.reduce(
      (best, day) => (day.total > best.total ? day : best),
      { date: '', total: 0 },
    )
    const topAgentTotals = new Map<string, number>()
    let agentGrandTotal = 0
    for (const project of summary.projectAgentTotals) {
      for (const agent of project.agents) {
        topAgentTotals.set(agent.agent, (topAgentTotals.get(agent.agent) ?? 0) + agent.total)
        agentGrandTotal += agent.total
      }
    }
    const topAgentEntry = [...topAgentTotals.entries()].sort((a, b) => b[1] - a[1])[0]
    const focusShare = stats.turnCount > 0 ? stats.focusTurns / stats.turnCount : 0
    const activeDayRate = stats.activeDays / summary.periodDays
    return {
      activeCalendarDays,
      activeDayRate,
      bestCalendarDay,
      focusShare,
      currentStreak,
      topAgentName: topAgentEntry?.[0] ?? null,
      topAgentShare: agentGrandTotal > 0 ? (topAgentEntry?.[1] ?? 0) / agentGrandTotal : 0,
      topAgentTotal: topAgentEntry?.[1] ?? 0,
    }
  }, [stats, summary])

  if (!summary && !error) {
    return <div className="h-full bg-background" />
  }

  if (!summary || summary.topProjects.length === 0) {
    return (
      <PageShell className="py-8" fluid>
        <header>
          <h1 className="font-heading text-2xl font-semibold">{t('history.title')}</h1>
        </header>
        <div className="mt-8">
          <h2 className="font-heading text-xl font-semibold">{t('history.noHistoryYet')}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {error ?? t('history.noHistoryDescription')}
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex flex-col gap-5 py-7 sm:px-7 sm:py-8" fluid>
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted-foreground">{t('history.retrospective')}</p>
          <h1 className="font-heading text-2xl font-semibold">{t('history.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Spinner
            aria-hidden={!isLoadingPeriod}
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-opacity',
              isLoadingPeriod ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Tabs
            value={periodDays.toString()}
            onValueChange={(v) => setPeriodDays(Number(v) as (typeof PERIODS)[number])}
          >
            <TabsList>
              {PERIODS.map((period) => (
                <TabsTab
                  key={period}
                  value={period.toString()}
                  className="h-6 px-2.5 font-heading text-[11.5px] tracking-tight tabular-nums"
                >
                  {formatPeriodLabel(period, locale)}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      {stats && (
        <section className="grid gap-2 md:grid-cols-4">
          <StatTile
            detail={formatDelta(summary.periodCompare.deltaRatio, t)}
            label={formatPeriodTotalLabel(summary.periodDays, locale, t)}
            value={<DurationSummaryFlow locale={locale} seconds={stats.periodTotal} />}
          />
          <StatTile
            detail={`${stats.turnCount} ${t('history.turns')} · p75 ${formatDurationSummary(stats.p75Turn, locale)}`}
            label={t('history.medianTurn')}
            value={<DurationSummaryFlow locale={locale} seconds={stats.medianTurn} />}
          />
          <StatTile
            detail={`${Math.round(stats.shortTurnRate * 100)}% ${t('history.underFive')}`}
            label={t('history.focusBlocks')}
            value={<NumberFlow locales={locale} value={stats.focusTurns} />}
          />
          <StatTile
            detail={`${formatDurationSummary(stats.peakHour.total, locale)} · ${stats.topProject?.project ?? t('common.noProject')} ${Math.round(stats.topProjectShare * 100)}%`}
            label={t('history.peakRhythm')}
            value={formatHourWindow(stats.peakHour.weekday, stats.peakHour.hour, locale)}
          />
        </section>
      )}

      <DashboardPanel
        title={t('history.contributionHeatmap')}
        description={t('history.contributionHeatmapDescription')}
      >
        {insights && (
          <InsightBar
            items={[
              { label: t('history.activeDays'), value: `${insights.activeCalendarDays} / 365` },
              {
                label: t('history.currentStreak'),
                value: `${insights.currentStreak} ${t('history.days')}`,
              },
              {
                label: t('history.bestDay'),
                value: `${insights.bestCalendarDay.date.slice(5)} · ${formatDurationSummary(insights.bestCalendarDay.total, locale)}`,
              },
            ]}
          />
        )}
        <CalendarHeatmap
          chartThemeName={chartThemeName}
          locale={locale}
          summary={summary}
          tokens={tokens}
        />
      </DashboardPanel>

      <DashboardPanel
        title={t('history.hourlyRhythm')}
        description={t('history.hourlyRhythmDescription')}
      >
        {stats && (
          <InsightBar
            items={[
              {
                label: t('history.peakWindow'),
                value: formatHourWindow(stats.peakHour.weekday, stats.peakHour.hour, locale),
              },
              {
                label: t('history.peakTotal'),
                value: formatDurationSummary(stats.peakHour.total, locale),
              },
              {
                label: t('history.bestDay'),
                value: stats.bestDay.date.slice(5) || '-',
              },
            ]}
          />
        )}
        <HourlyActivityHeatmap
          chartThemeName={chartThemeName}
          locale={locale}
          summary={summary}
          tokens={tokens}
        />
      </DashboardPanel>

      <DashboardPanel
        title={t('history.projectTrends')}
        description={t('history.projectTrendsDescription')}
      >
        {stats && (
          <InsightBar
            items={[
              {
                label: t('history.change'),
                value: formatDelta(summary.periodCompare.deltaRatio, t),
              },
              {
                label: t('history.activeDays'),
                value: `${stats.activeDays} / ${summary.periodDays}`,
              },
              {
                label: t('history.bestDay'),
                value: `${stats.bestDay.date.slice(5)} · ${formatDurationSummary(stats.bestDay.total, locale)}`,
              },
            ]}
          />
        )}
        <TrendChart
          chartThemeName={chartThemeName}
          locale={locale}
          summary={summary}
          t={t}
          tokens={tokens}
        />
      </DashboardPanel>

      <section className="grid gap-5 xl:grid-cols-2">
        <DashboardPanel
          title={t('history.projectShare')}
          description={t('history.projectShareDescription')}
        >
          {stats && (
            <InsightBar
              items={[
                {
                  label: t('history.topProject'),
                  value: `${stats.topProject?.project ?? t('common.noProject')} · ${formatPercent(stats.topProjectShare)}`,
                },
                {
                  label: t('history.avgActiveDay'),
                  value: formatDurationSummary(stats.averageActiveDay, locale),
                },
                {
                  label: t('history.turns'),
                  value: `${stats.turnCount}`,
                },
              ]}
            />
          )}
          <ProjectShareChart
            chartThemeName={chartThemeName}
            locale={locale}
            summary={summary}
            tokens={tokens}
          />
        </DashboardPanel>

        <DashboardPanel
          title={t('history.agentContribution')}
          description={t('history.agentContributionDescription')}
        >
          {insights && (
            <InsightBar
              items={[
                {
                  label: t('history.topAgent'),
                  value: insights.topAgentName ?? t('common.noAgent'),
                },
                {
                  label: t('history.share'),
                  value: formatPercent(insights.topAgentShare),
                },
                {
                  label: t('history.total'),
                  value: formatDurationSummary(insights.topAgentTotal, locale),
                },
              ]}
            />
          )}
          <AgentContributionBars locale={locale} summary={summary} t={t} />
        </DashboardPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DashboardPanel
          title={t('history.focusDuration')}
          description={t('history.focusDurationDescription')}
        >
          {stats && insights && (
            <InsightBar
              items={[
                {
                  label: t('history.focusShare'),
                  value: formatPercent(insights.focusShare),
                },
                {
                  label: t('history.fragmented'),
                  value: formatPercent(stats.shortTurnRate),
                },
                {
                  label: t('history.median'),
                  value: formatDurationSummary(stats.medianTurn, locale),
                },
              ]}
            />
          )}
          <FocusDurationChart
            chartThemeName={chartThemeName}
            locale={locale}
            summary={summary}
            t={t}
            tokens={tokens}
          />
        </DashboardPanel>

        <DashboardPanel
          title={t('history.projectEngagement')}
          description={t('history.projectEngagementDescription')}
        >
          <ProjectEngagementChart
            chartThemeName={chartThemeName}
            locale={locale}
            summary={summary}
            t={t}
            tokens={tokens}
          />
        </DashboardPanel>
      </section>

      <DashboardPanel
        title={t('history.contextSwitches')}
        description={t('history.contextSwitchesDescription')}
      >
        <ContextSwitchChart
          chartThemeName={chartThemeName}
          summary={summary}
          t={t}
          tokens={tokens}
        />
      </DashboardPanel>

      <DashboardPanel title={t('history.topProjects')}>
        <Table className="text-[13px]">
          <TableHeader className="[&_tr]:border-border/35">
            <TableRow className="border-border/35">
              {(['project', 'total', 'turns', 'lastActive', 'focusTurns', 'median'] as const).map(
                (key) => (
                  <TableHead className="h-8 px-3 text-[11px]" key={key}>
                    <button
                      className="inline-flex items-center"
                      onClick={() => changeSort(key)}
                      type="button"
                    >
                      {key === 'project'
                        ? t('history.project')
                        : key === 'lastActive'
                          ? t('history.lastActive')
                          : key === 'total'
                            ? t('history.total')
                            : key === 'turns'
                              ? t('history.turns')
                              : key === 'focusTurns'
                                ? t('history.focusCount')
                                : t('history.median')}
                      <SortIcon active={sortKey === key} asc={sortAsc} />
                    </button>
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow className="border-border/25" key={row.project}>
                <TableCell className="px-3 py-3">{row.project}</TableCell>
                <TableCell className="px-3 py-3 font-heading tracking-tight tabular-nums">
                  {formatDurationSummary(row.total, locale)}
                </TableCell>
                <TableCell className="px-3 py-3 font-heading tracking-tight tabular-nums">
                  {row.turns}
                </TableCell>
                <TableCell className="px-3 py-3">
                  {formatShortDate(row.lastActive, locale)}
                </TableCell>
                <TableCell className="px-3 py-3 font-heading tracking-tight text-muted-foreground tabular-nums">
                  {row.focusTurns}
                </TableCell>
                <TableCell className="px-3 py-3 font-heading tracking-tight text-muted-foreground tabular-nums">
                  {formatDurationSummary(row.median, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DashboardPanel>
    </PageShell>
  )
}
