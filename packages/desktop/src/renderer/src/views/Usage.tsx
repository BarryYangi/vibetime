import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import type {
  UsageMetricPeriodComparison,
  UsageSummaryBreakdownRow,
  UsageTokenBreakdown,
} from '@vibetime/core'
import type { EChartsCoreOption } from 'echarts/types/dist/echarts'
import { useAtomValue } from 'jotai'
import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, RefreshCwIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useResolvedColorScheme } from '@/appearance'
import { useChart } from '@/charts/useEChart'
import {
  AnalyticsHighlightSkeleton,
  AnalyticsPanelSkeleton,
  AnalyticsSummarySkeleton,
} from '@/components/analytics/AnalyticsSkeleton'
import { PageShell } from '@/components/PageShell'
import { Button } from '@/components/ui/button'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { useStaleCachedQuery } from '@/hooks/useStaleCachedQuery'
import { formatDurationFull, formatDurationSummary, formatPeriodLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { UsageAgentFilter, UsageSummary, UsageSummaryArgs } from '../../../shared/ipc-types'
import { HISTORY_PERIODS } from '../../../shared/ipc-types'
import { getChartThemeName, getChartTokens } from '../charts/theme'
import { type TranslationKey, useI18n } from '../i18n'
import {
  clearActiveUsageQuery,
  refreshUsageSummary,
  runUsageRefresh,
  syncUsageRefreshState,
  usageRefreshStateAtom,
  usageSummariesAtom,
  usageSummaryCacheKey,
} from '../store'

type ChartTokens = ReturnType<typeof getChartTokens>
type TFunction = ReturnType<typeof useI18n>['t']
type SortKey = 'label' | 'totalTokens' | 'estimatedCostUsd' | 'recordCount'
type RankMetric = 'cost' | 'tokens'
type SpendBreakdownKind = 'agent' | 'model' | 'project'

const EMPTY_USAGE_TOKENS: UsageTokenBreakdown = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
}

const AGENT_FILTERS: Array<{ value: UsageAgentFilter; labelKey?: TranslationKey; label?: string }> =
  [
    { value: 'all', labelKey: 'usage.all' },
    { value: 'claude-code', label: 'Claude Code' },
    { value: 'codex', label: 'Codex' },
  ]

const USD_NUMBER_FLOW_FORMAT = {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
} as const satisfies Intl.NumberFormatOptions

const COMPACT_NUMBER_FLOW_FORMAT = {
  maximumFractionDigits: 1,
  notation: 'compact',
} as const satisfies Intl.NumberFormatOptions

const PERCENT_NUMBER_FLOW_FORMAT = {
  maximumFractionDigits: 0,
  style: 'percent',
} as const satisfies Intl.NumberFormatOptions

function axisLabelStyle(tokens: ChartTokens) {
  return { color: tokens.axisLabel, fontFamily: 'SN Pro', fontSize: 11 }
}

function splitLineStyle(tokens: ChartTokens) {
  return { color: tokens.splitLine, width: 1 }
}

function tooltipExtraCss(tokens: ChartTokens) {
  return `box-shadow: 0 8px 24px ${tokens.tooltipShadow}; border-radius: 8px;`
}

function formatUsd(value: number | null, locale: string, unknownLabel: string): string {
  if (value === null) return unknownLabel
  return new Intl.NumberFormat(locale, {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

function formatTokens(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: 'compact' }).format(
    value,
  )
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDateLabel(value: string, locale: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    new Date(year, month - 1, day),
  )
}

function formatNullableUsd(value: number | null, locale: string, unknownLabel: string): string {
  return value === null ? unknownLabel : formatUsd(value, locale, unknownLabel)
}

function formatSignedUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    signDisplay: 'exceptZero',
    style: 'currency',
  }).format(value)
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 100)
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`
}

function previousPeriodPrefix(periodDays: number, locale: string): string {
  const period = formatPeriodLabel(periodDays, locale)
  return locale === 'zh-CN' ? `较前 ${period}` : `vs previous ${period}`
}

function formatEstimatedCostComparison(
  comparison: UsageMetricPeriodComparison | undefined,
  periodDays: number,
  locale: string,
): string | null {
  if (!comparison || comparison.delta === null) return null
  const delta =
    comparison.deltaRatio !== null
      ? formatSignedPercent(comparison.deltaRatio)
      : formatSignedUsd(comparison.delta, locale)
  return `${previousPeriodPrefix(periodDays, locale)} ${delta}`
}

function formatHourlyCostComparison(
  comparison: UsageMetricPeriodComparison | undefined,
  periodDays: number,
  locale: string,
  t: TFunction,
): string | null {
  if (!comparison || comparison.delta === null) return null
  return `${previousPeriodPrefix(periodDays, locale)} ${formatSignedUsd(comparison.delta, locale)}/${t('usage.hour')}`
}

function cacheHitRate(tokens: UsageTokenBreakdown): number {
  const inputRelatedTokens =
    tokens.inputTokens + tokens.cachedInputTokens + tokens.cacheCreationInputTokens
  return inputRelatedTokens > 0 ? Math.min(1, tokens.cachedInputTokens / inputRelatedTokens) : 0
}

function inputRelatedTokens(tokens: UsageTokenBreakdown): number {
  return tokens.inputTokens + tokens.cachedInputTokens + tokens.cacheCreationInputTokens
}

function inputTokenRate(tokens: UsageTokenBreakdown): number {
  const total = inputRelatedTokens(tokens)
  return total > 0 ? Math.min(1, tokens.inputTokens / total) : 0
}

function agentDisplayName(agent: string): string {
  if (agent === 'claude-code') return 'Claude Code'
  if (agent === 'codex') return 'Codex'
  return agent
}

function costValue(value: number | null): number {
  return value ?? 0
}

function pricingStatusText(status: UsageSummary['pricingStatus'], t: TFunction): string {
  if (status === 'fresh') return t('usage.pricingFresh')
  if (status === 'cached' || status === 'refresh_failed_with_cache') {
    return t('usage.pricingCached')
  }
  return t('usage.pricingUnavailable')
}

function UsdNumberFlow({
  locale,
  unknownLabel,
  value,
}: {
  locale: string
  unknownLabel: string
  value: number | null
}) {
  if (value === null) return unknownLabel
  return <NumberFlow format={USD_NUMBER_FLOW_FORMAT} locales={locale} value={value} />
}

function CompactNumberFlow({ locale, value }: { locale: string; value: number }) {
  return <NumberFlow format={COMPACT_NUMBER_FLOW_FORMAT} locales={locale} value={value} />
}

function PercentNumberFlow({ locale, value }: { locale: string; value: number }) {
  return <NumberFlow format={PERCENT_NUMBER_FLOW_FORMAT} locales={locale} value={value} />
}

function usagePricingDetail(summary: UsageSummary, t: TFunction): string {
  return `${t('usage.disclaimer')} · ${pricingStatusText(summary.pricingStatus, t)}`
}

function formatRankMetricValue(
  metric: RankMetric,
  value: number,
  locale: string,
  unknownLabel: string,
): string {
  if (metric === 'cost') return formatUsd(value, locale, unknownLabel)
  return formatTokens(value, locale)
}

function topRowsWithOther(
  rows: UsageSummaryBreakdownRow[],
  limit: number,
): UsageSummaryBreakdownRow[] {
  if (rows.length <= limit) return rows
  const top = rows.slice(0, limit)
  const other: UsageSummaryBreakdownRow = {
    key: 'other',
    label: 'Other',
    tokens: { ...EMPTY_USAGE_TOKENS },
    totalTokens: 0,
    estimatedCostUsd: null,
    unknownCostTokens: 0,
    recordCount: 0,
  }
  for (const row of rows.slice(limit)) {
    other.tokens.inputTokens += row.tokens.inputTokens
    other.tokens.cachedInputTokens += row.tokens.cachedInputTokens
    other.tokens.cacheCreationInputTokens += row.tokens.cacheCreationInputTokens
    other.tokens.outputTokens += row.tokens.outputTokens
    other.tokens.reasoningOutputTokens += row.tokens.reasoningOutputTokens
    other.tokens.totalTokens += row.tokens.totalTokens
    other.totalTokens += row.totalTokens
    other.estimatedCostUsd =
      other.estimatedCostUsd === null && row.estimatedCostUsd === null
        ? null
        : costValue(other.estimatedCostUsd) + costValue(row.estimatedCostUsd)
    other.unknownCostTokens += row.unknownCostTokens
    other.recordCount += row.recordCount
  }
  return other.recordCount > 0 ? [...top, other] : top
}

function topRowByCostOrTokens(rows: UsageSummaryBreakdownRow[]): UsageSummaryBreakdownRow | null {
  let best: UsageSummaryBreakdownRow | null = null
  for (const row of rows) {
    if (!best) {
      best = row
      continue
    }
    const rowCost = costValue(row.estimatedCostUsd)
    const bestCost = costValue(best.estimatedCostUsd)
    if (rowCost > bestCost || (rowCost === bestCost && row.totalTokens > best.totalTokens)) {
      best = row
    }
  }
  return best
}

function DashboardPanel({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <section className={cn('flex min-w-0 flex-col pt-1', className)}>
      <header className="mb-2.5 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 text-[13px] text-muted-foreground leading-snug">{description}</p>
          )}
        </div>
        {action && (
          <div className="electron-no-drag flex shrink-0 items-center justify-end">{action}</div>
        )}
      </header>
      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-sm shadow-black/[0.01]">
        <div className="flex h-full flex-col px-5 pt-4 pb-5">{children}</div>
      </div>
    </section>
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
    <div className="flex min-h-[132px] flex-col justify-between rounded-xl border border-border/40 bg-card/40 p-5 shadow-sm shadow-black/[0.01]">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <div className="min-w-0 truncate font-heading text-[24px] font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </div>
      </div>
      <div className="mt-4 truncate text-[12px] text-muted-foreground">{detail}</div>
    </div>
  )
}

function UsageLoadingSkeleton() {
  return (
    <>
      <AnalyticsSummarySkeleton className="grid-cols-4" />
      <AnalyticsHighlightSkeleton />

      <div className="grid gap-5">
        <AnalyticsPanelSkeleton />
        <div className="grid gap-5 xl:grid-cols-2">
          <AnalyticsPanelSkeleton />
          <AnalyticsPanelSkeleton />
        </div>
      </div>
    </>
  )
}

function UsageHighlights({
  locale,
  summary,
  t,
}: {
  locale: string
  summary: UsageSummary
  t: TFunction
}) {
  const highlights = useMemo(() => {
    let peakDay: UsageSummary['daily'][number] | null = null
    for (const day of summary.daily) {
      if (!peakDay || costValue(day.estimatedCostUsd) > costValue(peakDay.estimatedCostUsd)) {
        peakDay = day
      }
    }

    const topProject = topRowByCostOrTokens(summary.byProject)
    const topModel = topRowByCostOrTokens(summary.byModel)
    const inputRate = inputTokenRate(summary.tokenBreakdown)

    return [
      {
        label: t('usage.peakSpendDay'),
        value: peakDay ? formatDateLabel(peakDay.date, locale) : t('usage.unknown'),
        detail: peakDay
          ? `${formatUsd(peakDay.estimatedCostUsd, locale, t('usage.unknown'))} · ${formatTokens(peakDay.totalTokens, locale)}`
          : t('usage.noTableData'),
      },
      {
        label: t('usage.topProject'),
        value: topProject?.label ?? t('usage.unknown'),
        detail: topProject
          ? `${formatUsd(topProject.estimatedCostUsd, locale, t('usage.unknown'))} · ${formatTokens(topProject.totalTokens, locale)}`
          : t('usage.noTableData'),
      },
      {
        label: t('usage.topModel'),
        value: topModel?.label ?? t('usage.unknown'),
        detail: topModel
          ? `${formatUsd(topModel.estimatedCostUsd, locale, t('usage.unknown'))} · ${formatTokens(topModel.totalTokens, locale)}`
          : t('usage.noTableData'),
      },
      {
        label: t('usage.inputTokens'),
        value: formatTokens(summary.tokenBreakdown.inputTokens, locale),
        detail: `${t('usage.inputRelatedShare')} ${formatPercent(inputRate)}`,
      },
    ]
  }, [locale, summary.byModel, summary.byProject, summary.daily, summary.tokenBreakdown, t])

  return (
    <section className="grid gap-2 lg:grid-cols-4">
      {highlights.map((item) => (
        <div
          className="min-w-0 rounded-xl border border-border/50 bg-card/30 px-4 py-3"
          key={item.label}
        >
          <div className="text-[12px] font-medium text-muted-foreground">{item.label}</div>
          <div className="mt-1 truncate font-heading text-[15px] font-semibold text-foreground">
            {item.value}
          </div>
          <div className="mt-1 truncate text-[12px] text-muted-foreground">{item.detail}</div>
        </div>
      ))}
    </section>
  )
}

function CostTimeTrendChart({
  chartThemeName,
  locale,
  summary,
  t,
  tokens,
}: {
  chartThemeName: string
  locale: string
  summary: UsageSummary
  t: TFunction
  tokens: ChartTokens
}) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    const efficiencyByDate = new Map(summary.efficiency.daily.map((day) => [day.date, day]))
    const source = summary.daily.map((day) => {
      const efficiency = efficiencyByDate.get(day.date)
      return {
        date: day.date.slice(5),
        cost: costValue(day.estimatedCostUsd),
        duration: efficiency?.durationSec ?? 0,
        hourlyCost: efficiency?.costPerHourUsd ?? null,
        tokens: day.totalTokens,
        cache: cacheHitRate(day.tokens),
      }
    })

    return {
      color: [tokens.seriesPalette[0], tokens.seriesPalette[2]],
      dataset: {
        dimensions: ['date', 'cost', 'duration', 'hourlyCost', 'tokens', 'cache'],
        source,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', z: 0, crossStyle: { color: tokens.axisPointer } },
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: Array<{ data: Record<string, unknown> }>) => {
          const row = params[0]?.data as
            | {
                date: string
                cost: number
                duration: number
                hourlyCost: number | null
                tokens: number
                cache: number
              }
            | undefined
          if (!row) return ''
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${row.date}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${formatUsd(row.cost, locale, t('usage.unknown'))} · ${formatDurationFull(row.duration, locale)}</div><div style="margin-top:2px;color:${tokens.tooltipMuted}">${formatNullableUsd(row.hourlyCost, locale, t('usage.unknown'))}/${t('usage.hour')} · ${formatTokens(row.tokens, locale)} · ${formatPercent(row.cache)}</div>`
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
      grid: { left: 8, right: 8, top: 38, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...labels,
          interval: Math.max(0, Math.floor(summary.daily.length / 8)),
        },
      },
      yAxis: [
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            ...labels,
            formatter: (value: number) => formatUsd(value, locale, t('usage.unknown')),
          },
          splitLine: { lineStyle: splitLineStyle(tokens) },
        },
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            ...labels,
            formatter: (value: number) => formatDurationSummary(value, locale),
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t('usage.cost'),
          type: 'bar',
          barMaxWidth: 16,
          encode: { x: 'date', y: 'cost' },
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          yAxisIndex: 0,
        },
        {
          name: t('usage.agentTime'),
          type: 'line',
          encode: { x: 'date', y: 'duration' },
          lineStyle: { width: 2 },
          showSymbol: summary.periodDays <= 30,
          yAxisIndex: 1,
        },
      ],
    }
  }, [locale, summary.daily, summary.efficiency.daily, summary.periodDays, t, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[300px] w-full" />
}

function DailyTokenCompositionChart({
  chartThemeName,
  locale,
  summary,
  t,
  tokens,
}: {
  chartThemeName: string
  locale: string
  summary: UsageSummary
  t: TFunction
  tokens: ChartTokens
}) {
  const inputRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const dates = useMemo(() => summary.daily.map((day) => day.date.slice(5)), [summary.daily])
  const makeOption = useMemo(() => {
    return (
      rows: Array<{ key: keyof UsageTokenBreakdown; label: string; colorIndex: number }>,
    ): EChartsCoreOption => {
      const labels = axisLabelStyle(tokens)
      return {
        color: rows.map(
          (row) => tokens.seriesPalette[row.colorIndex % tokens.seriesPalette.length],
        ),
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
          borderWidth: 0,
          confine: true,
          extraCssText: tooltipExtraCss(tokens),
          backgroundColor: tokens.tooltipBg,
          formatter: (
            params: Array<{ marker: string; name: string; seriesName: string; value: number }>,
          ) => {
            const date = params[0]?.name ?? ''
            const rowsHtml = params
              .filter((item) => Number(item.value) > 0)
              .map(
                (item) =>
                  `<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:4px">${item.marker}<span style="color:${tokens.tooltipRow}">${item.seriesName}</span><span style="font-weight:600;color:${tokens.text}">${formatTokens(Number(item.value), locale)}</span></div>`,
              )
              .join('')
            return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${date}</div>${rowsHtml || `<div style="margin-top:4px;color:${tokens.tooltipMuted}">${t('usage.emptyTitle')}</div>`}`
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
        grid: { left: 8, right: 10, top: 38, bottom: 18, containLabel: true },
        xAxis: {
          type: 'category',
          data: dates,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            ...labels,
            interval: Math.max(0, Math.floor(summary.daily.length / 8)),
          },
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { ...labels, formatter: (value: number) => formatTokens(value, locale) },
          splitLine: { lineStyle: splitLineStyle(tokens) },
        },
        dataZoom:
          summary.periodDays >= 90
            ? [{ type: 'inside', filterMode: 'none', start: 0, end: 100 }]
            : undefined,
        series: rows.map((row, index) => ({
          name: row.label,
          type: 'bar',
          stack: 'tokens',
          barMaxWidth: 16,
          data: summary.daily.map((day) => day.tokens[row.key]),
          itemStyle: {
            borderRadius: index === rows.length - 1 ? [3, 3, 0, 0] : 0,
          },
        })),
      }
    }
  }, [dates, locale, summary.daily, summary.periodDays, t, tokens])
  const inputOption = useMemo<EChartsCoreOption>(() => {
    return makeOption([
      { key: 'inputTokens', label: t('usage.inputTokens'), colorIndex: 0 },
      { key: 'cachedInputTokens', label: t('usage.cachedInputTokens'), colorIndex: 1 },
      { key: 'cacheCreationInputTokens', label: t('usage.cacheCreationTokens'), colorIndex: 2 },
    ])
  }, [makeOption, t])
  const outputOption = useMemo<EChartsCoreOption>(() => {
    return makeOption([
      { key: 'outputTokens', label: t('usage.outputTokens'), colorIndex: 3 },
      { key: 'reasoningOutputTokens', label: t('usage.reasoningTokens'), colorIndex: 4 },
    ])
  }, [makeOption, t])
  useChart(inputRef, inputOption, chartThemeName)
  useChart(outputRef, outputOption, chartThemeName)
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-1 px-1 text-[12px] font-medium text-muted-foreground">
          {t('usage.inputCacheTokens')}
        </div>
        <div ref={inputRef} className="h-[260px] w-full" />
      </div>
      <div className="min-w-0">
        <div className="mb-1 px-1 text-[12px] font-medium text-muted-foreground">
          {t('usage.outputReasoningTokens')}
        </div>
        <div ref={outputRef} className="h-[260px] w-full" />
      </div>
    </div>
  )
}

function AgentContributionChart({
  chartThemeName,
  locale,
  summary,
  t,
  tokens,
}: {
  chartThemeName: string
  locale: string
  summary: UsageSummary
  t: TFunction
  tokens: ChartTokens
}) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    const efficiencyByAgent = new Map(summary.efficiency.byAgent.map((row) => [row.key, row]))
    const agents = summary.byAgent.map((row) => ({
      key: row.key,
      label: agentDisplayName(row.key),
      cost: costValue(row.estimatedCostUsd),
      tokens: row.totalTokens,
      duration: efficiencyByAgent.get(row.key)?.durationSec ?? 0,
      turns: efficiencyByAgent.get(row.key)?.turnCount ?? 0,
    }))
    const totals = {
      cost: agents.reduce((sum, row) => sum + row.cost, 0),
      tokens: agents.reduce((sum, row) => sum + row.tokens, 0),
      duration: agents.reduce((sum, row) => sum + row.duration, 0),
    }
    const metrics = [
      { key: 'cost', label: t('usage.cost') },
      { key: 'tokens', label: t('usage.tokens') },
      { key: 'duration', label: t('usage.agentTime') },
    ] as const
    const valueFor = (agent: (typeof agents)[number], key: (typeof metrics)[number]['key']) => {
      if (key === 'cost') return agent.cost
      if (key === 'tokens') return agent.tokens
      return agent.duration
    }
    const totalFor = (key: (typeof metrics)[number]['key']) => {
      if (key === 'cost') return totals.cost
      if (key === 'tokens') return totals.tokens
      return totals.duration
    }
    const formatActual = (key: (typeof metrics)[number]['key'], value: number) => {
      if (key === 'cost') return formatUsd(value, locale, t('usage.unknown'))
      if (key === 'tokens') return formatTokens(value, locale)
      return formatDurationFull(value, locale)
    }

    return {
      color: agents.map((_, index) => tokens.seriesPalette[index % tokens.seriesPalette.length]),
      legend: {
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemHeight: 8,
        itemWidth: 14,
        textStyle: labels,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (
          params: Array<{
            dataIndex: number
            marker: string
            seriesName: string
            value: number
          }>,
        ) => {
          const metric = metrics[params[0]?.dataIndex ?? 0]
          if (!metric) return ''
          const rowsHtml = params
            .map((item) => {
              const agent = agents.find((row) => row.label === item.seriesName)
              if (!agent) return ''
              const actual = valueFor(agent, metric.key)
              const turns =
                metric.key === 'duration' && agent.turns > 0
                  ? ` · ${agent.turns} ${t('history.turns')}`
                  : ''
              return `<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:4px">${item.marker}<span style="color:${tokens.tooltipRow}">${item.seriesName}</span><span style="font-weight:600;color:${tokens.text}">${formatActual(metric.key, actual)} · ${formatPercent(Number(item.value) / 100)}${turns}</span></div>`
            })
            .join('')
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${metric.label}</div>${rowsHtml}`
        },
      },
      grid: { left: 8, right: 8, top: 34, bottom: 8, containLabel: true },
      xAxis: {
        max: 100,
        min: 0,
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...labels, formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      yAxis: {
        type: 'category',
        data: metrics.map((metric) => metric.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: labels,
      },
      series: agents.map((agent) => ({
        name: agent.label,
        type: 'bar',
        stack: 'agent',
        barMaxWidth: 18,
        data: metrics.map((metric) => {
          const total = totalFor(metric.key)
          return total > 0 ? (valueFor(agent, metric.key) / total) * 100 : 0
        }),
        label: {
          show: true,
          formatter: (params: { value: number }) =>
            Number(params.value) >= 12 ? `${Math.round(Number(params.value))}%` : '',
          color: tokens.text,
          fontSize: 11,
          fontWeight: 600,
        },
        itemStyle: { borderRadius: 3 },
      })),
    }
  }, [locale, summary.byAgent, summary.efficiency.byAgent, t, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[200px] w-full" />
}

function SpendBreakdown({
  locale,
  summary,
  t,
  tokens,
}: {
  locale: string
  summary: UsageSummary
  t: TFunction
  tokens: ChartTokens
}) {
  const groups = useMemo(() => {
    const makeGroup = (
      kind: SpendBreakdownKind,
      label: string,
      rows: UsageSummaryBreakdownRow[],
      limit: number,
    ) => {
      const normalizedRows = topRowsWithOther(rows, limit).map((row) =>
        row.key === 'other'
          ? { ...row, label: t('usage.other') }
          : kind === 'agent'
            ? { ...row, label: agentDisplayName(row.key) }
            : row,
      )
      const totalCost = normalizedRows.reduce(
        (sum, row) => sum + costValue(row.estimatedCostUsd),
        0,
      )
      const totalTokens = normalizedRows.reduce((sum, row) => sum + row.totalTokens, 0)
      const segments = normalizedRows.map((row, index) => {
        const cost = costValue(row.estimatedCostUsd)
        return {
          color: tokens.seriesPalette[index % tokens.seriesPalette.length],
          cost,
          key: row.key,
          label: row.label,
          percent: totalCost > 0 ? cost / totalCost : 0,
          tokens: row.totalTokens,
        }
      })
      const leader = segments[0] ?? null
      return { kind, label, leader, segments, totalCost, totalTokens }
    }

    return [
      makeGroup('project', t('usage.projects'), summary.byProject, 5),
      makeGroup('model', t('usage.models'), summary.byModel, 5),
      makeGroup('agent', t('usage.agents'), summary.byAgent, 3),
    ]
  }, [summary.byAgent, summary.byModel, summary.byProject, t, tokens.seriesPalette])

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div className="min-w-0" key={group.kind}>
          <div className="mb-2 flex min-w-0 items-baseline justify-between gap-4 px-1">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-muted-foreground">{group.label}</div>
              <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">
                {group.leader
                  ? `${group.leader.label} · ${formatPercent(group.leader.percent)}`
                  : t('usage.noSpendData')}
              </div>
            </div>
            <div className="shrink-0 text-right text-[12px] text-muted-foreground">
              <div>{formatUsd(group.totalCost, locale, t('usage.unknown'))}</div>
              <div>{formatTokens(group.totalTokens, locale)}</div>
            </div>
          </div>
          <div className="flex h-7 overflow-hidden rounded-md bg-muted/50">
            {group.segments.map((segment) => (
              <div
                className="min-w-[2px]"
                key={segment.key}
                style={{
                  backgroundColor: segment.color,
                  width: `${Math.max(segment.percent * 100, segment.percent > 0 ? 1 : 0)}%`,
                }}
                title={`${segment.label} ${formatPercent(segment.percent)} ${formatUsd(segment.cost, locale, t('usage.unknown'))} ${formatTokens(segment.tokens, locale)}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
            {group.segments.slice(0, 4).map((segment) => (
              <div
                className="flex max-w-[220px] items-center gap-1.5 text-[12px] text-muted-foreground"
                key={segment.key}
              >
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="truncate">{segment.label}</span>
                <span className="shrink-0 tabular-nums">{formatPercent(segment.percent)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RankBarChart({
  chartThemeName,
  kind,
  locale,
  metric,
  rows,
  t,
  tokens,
}: {
  chartThemeName: string
  kind: 'project' | 'model'
  locale: string
  metric: RankMetric
  rows: UsageSummaryBreakdownRow[]
  t: TFunction
  tokens: ChartTokens
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRows = useMemo(
    () =>
      topRowsWithOther(rows, 10)
        .map((row) => (row.key === 'other' ? { ...row, label: t('usage.other') } : row))
        .reverse(),
    [rows, t],
  )
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    const metricName = metric === 'cost' ? t('usage.cost') : t('usage.tokens')
    return {
      color: [kind === 'project' ? tokens.seriesPalette[1] : tokens.seriesPalette[4]],
      dataset: {
        dimensions: ['name', 'cost', 'tokens', 'records', 'cache'],
        source: chartRows.map((row) => ({
          name: row.label,
          cost: costValue(row.estimatedCostUsd),
          tokens: row.totalTokens,
          records: row.recordCount,
          cache: cacheHitRate(row.tokens),
        })),
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: Array<{ data: Record<string, unknown> }>) => {
          const row = params[0]?.data as
            | { name: string; cost: number; tokens: number; records: number; cache: number }
            | undefined
          if (!row) return ''
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${row.name}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${formatRankMetricValue(metric, metric === 'cost' ? row.cost : row.tokens, locale, t('usage.unknown'))}</div><div style="margin-top:2px;color:${tokens.tooltipMuted}">${formatTokens(row.tokens, locale)} · ${formatUsd(row.cost, locale, t('usage.unknown'))} · ${formatPercent(row.cache)}</div>`
        },
      },
      grid: { left: 8, right: 16, top: 6, bottom: 10, containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...labels,
          formatter: (value: number) =>
            metric === 'cost'
              ? formatUsd(value, locale, t('usage.unknown'))
              : formatTokens(value, locale),
        },
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      yAxis: {
        type: 'category',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...labels,
          overflow: 'truncate',
          width: 160,
        },
      },
      series: [
        {
          name: metricName,
          type: 'bar',
          barMaxWidth: 14,
          encode: { x: metric, y: 'name' },
          itemStyle: { borderRadius: [0, 3, 3, 0] },
        },
      ],
    }
  }, [chartRows, kind, locale, metric, t, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[300px] w-full" />
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  const Icon = asc ? ArrowUpIcon : ArrowDownIcon
  return (
    <Icon
      aria-hidden="true"
      className={cn('ml-1 inline size-3 transition-opacity', active ? 'opacity-100' : 'opacity-0')}
    />
  )
}

function RankMetricTabs({
  onValueChange,
  t,
  value,
}: {
  onValueChange: (value: RankMetric) => void
  t: TFunction
  value: RankMetric
}) {
  return (
    <Tabs onValueChange={(next) => onValueChange(next as RankMetric)} value={value}>
      <TabsList>
        {(['cost', 'tokens'] as const).map((metric) => (
          <TabsTab key={metric} value={metric}>
            {t(`usage.metric.${metric}` as TranslationKey)}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  )
}

function UsageRankTable({
  locale,
  nameLabel,
  rows,
  t,
}: {
  locale: string
  nameLabel: string
  rows: UsageSummaryBreakdownRow[]
  t: TFunction
}) {
  const [sortKey, setSortKey] = useState<SortKey>('totalTokens')
  const [sortAsc, setSortAsc] = useState(false)
  const sortedRows = useMemo(() => {
    const data = [...rows]
    return data.sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortKey === 'label') return a.label.localeCompare(b.label) * dir
      const aValue = a[sortKey] ?? 0
      const bValue = b[sortKey] ?? 0
      return (Number(aValue) - Number(bValue)) * dir
    })
  }, [rows, sortAsc, sortKey])

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((value) => !value)
    else {
      setSortKey(key)
      setSortAsc(key === 'label')
    }
  }

  return (
    <div className="min-h-[260px] overflow-auto">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">
              <button onClick={() => changeSort('label')} type="button">
                {nameLabel} <SortIcon active={sortKey === 'label'} asc={sortAsc} />
              </button>
            </TableHead>
            <TableHead className="w-[22%] text-right">
              <button onClick={() => changeSort('totalTokens')} type="button">
                {t('usage.tokens')} <SortIcon active={sortKey === 'totalTokens'} asc={sortAsc} />
              </button>
            </TableHead>
            <TableHead className="w-[22%] text-right">
              <button onClick={() => changeSort('estimatedCostUsd')} type="button">
                {t('usage.cost')} <SortIcon active={sortKey === 'estimatedCostUsd'} asc={sortAsc} />
              </button>
            </TableHead>
            <TableHead className="w-[16%] text-right">
              <button onClick={() => changeSort('recordCount')} type="button">
                {t('usage.rows')} <SortIcon active={sortKey === 'recordCount'} asc={sortAsc} />
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-muted-foreground" colSpan={4}>
                {t('usage.noTableData')}
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="truncate font-medium" title={row.label}>
                  {row.label}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatTokens(row.totalTokens, locale)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd(row.estimatedCostUsd, locale, t('usage.unknown'))}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {row.recordCount}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default function Usage() {
  const colorScheme = useResolvedColorScheme()
  const { locale, t } = useI18n()
  const [periodDays, setPeriodDays] = useState<UsageSummary['periodDays']>(30)
  const [agent, setAgent] = useState<UsageAgentFilter>('all')
  const [project, setProject] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [manualRefreshError, setManualRefreshError] = useState<string | null>(null)
  const [projectRankMetric, setProjectRankMetric] = useState<RankMetric>('cost')
  const [modelRankMetric, setModelRankMetric] = useState<RankMetric>('cost')
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const usageSummaries = useAtomValue(usageSummariesAtom)
  const refreshState = useAtomValue(usageRefreshStateAtom)
  const args = useMemo<UsageSummaryArgs>(
    () => ({ periodDays, agent, project, model, includeSidechain: true }),
    [agent, model, periodDays, project],
  )
  const cacheKey = useMemo(() => usageSummaryCacheKey(args), [args])
  const exactSummary = usageSummaries[cacheKey] ?? null
  const refreshSummary = useCallback(() => refreshUsageSummary(args), [args])
  const {
    error: queryError,
    isInitialLoading,
    isStaleLoading,
    visibleValue: summary,
  } = useStaleCachedQuery({
    cacheKey,
    cachedValue: exactSummary,
    refresh: refreshSummary,
  })
  const error = manualRefreshError ?? queryError
  const chartThemeName = useMemo(() => getChartThemeName(colorScheme), [colorScheme])
  const tokens = useMemo(() => getChartTokens(colorScheme), [colorScheme])

  useEffect(() => {
    setManualRefreshError((current) => (cacheKey && current !== null ? null : current))
  }, [cacheKey])

  useEffect(() => {
    void syncUsageRefreshState()
    return () => {
      clearActiveUsageQuery()
    }
  }, [])

  const handleManualRefresh = async () => {
    setManualRefreshing(true)
    setManualRefreshError(null)
    try {
      const result = await runUsageRefresh()
      if (result && !result.ok) {
        setManualRefreshError(result.error)
      }
    } catch (err) {
      setManualRefreshError(String(err))
    } finally {
      setManualRefreshing(false)
    }
  }

  const isRefreshing = manualRefreshing || refreshState.status === 'loading'
  const hasData = summary !== null && summary.totals.recordCount > 0
  const modelItems = [
    { label: t('usage.allModels'), value: 'all' },
    ...(summary?.availableFilters.models ?? []).map((value) => ({ label: value, value })),
  ]
  const projectItems = [
    { label: t('usage.allProjects'), value: 'all' },
    ...(summary?.availableFilters.projects ?? []).map((value) => ({ label: value, value })),
  ]
  const agentItems = AGENT_FILTERS.map((item) => ({
    label: item.labelKey ? t(item.labelKey) : (item.label ?? item.value),
    value: item.value,
  }))

  if (error && !summary && !isInitialLoading) {
    return (
      <PageShell fluid className="flex min-h-full items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <CircleAlertIcon aria-hidden="true" className="size-8 text-muted-foreground" />
          <h1 className="text-[20px] font-semibold">{t('usage.errorTitle')}</h1>
          <p className="text-[13px] text-muted-foreground">{t('usage.errorDescription')}</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell fluid className="flex flex-col gap-5 py-7 sm:px-7 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{t('usage.eyebrow')}</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-foreground">
            {t('usage.title')}
          </h1>
        </div>
        <div className="electron-no-drag flex flex-wrap items-center justify-end gap-2">
          <Spinner
            aria-hidden={!isStaleLoading}
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-opacity',
              isStaleLoading ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Tabs
            onValueChange={(value) => setPeriodDays(Number(value) as UsageSummary['periodDays'])}
            value={String(periodDays)}
          >
            <TabsList>
              {HISTORY_PERIODS.map((days) => (
                <TabsTab key={days} value={String(days)}>
                  {formatPeriodLabel(days, locale)}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
          <Select
            items={agentItems}
            onValueChange={(value) => setAgent((value as UsageAgentFilter | null) ?? 'all')}
            value={agent}
          >
            <SelectTrigger className="w-36" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {agentItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Select
            items={projectItems}
            onValueChange={(value) => setProject(!value || value === 'all' ? null : value)}
            value={project ?? 'all'}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {projectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Select
            items={modelItems}
            onValueChange={(value) => setModel(!value || value === 'all' ? null : value)}
            value={model ?? 'all'}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {modelItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button
            disabled={isRefreshing}
            loading={isRefreshing}
            onClick={handleManualRefresh}
            size="sm"
            variant="secondary"
          >
            <RefreshCwIcon aria-hidden="true" />
            {t('usage.refresh')}
          </Button>
        </div>
      </header>

      {isInitialLoading ? (
        <UsageLoadingSkeleton />
      ) : !summary || !hasData ? (
        <div className="rounded-xl border border-border/60 bg-card/40 px-5 py-12 text-center">
          <h2 className="text-[20px] font-semibold text-foreground">{t('usage.emptyTitle')}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">{t('usage.emptyDescription')}</p>
          <p className="mt-4 text-[12px] text-muted-foreground">{t('usage.claudeCodexOnly')}</p>
        </div>
      ) : (
        <>
          <NumberFlowGroup>
            <div className="grid grid-cols-4 gap-2">
              <StatTile
                label={t('usage.estimatedCost')}
                value={
                  <UsdNumberFlow
                    locale={locale}
                    unknownLabel={t('usage.unknown')}
                    value={summary.totals.estimatedCostUsd}
                  />
                }
                detail={
                  formatEstimatedCostComparison(
                    summary.periodCompare?.estimatedCostUsd,
                    summary.periodDays,
                    locale,
                  ) ?? usagePricingDetail(summary, t)
                }
              />
              <StatTile
                label={t('usage.totalTokens')}
                value={<CompactNumberFlow locale={locale} value={summary.totals.totalTokens} />}
                detail={`${summary.totals.recordCount} ${t('usage.usageRows')}`}
              />
              <StatTile
                label={t('usage.cacheHitRate')}
                value={
                  <PercentNumberFlow locale={locale} value={cacheHitRate(summary.tokenBreakdown)} />
                }
                detail={`${formatTokens(summary.tokenBreakdown.cachedInputTokens, locale)} ${t('usage.cachedTokens')}`}
              />
              <StatTile
                label={t('usage.averageHourlyCost')}
                value={
                  <UsdNumberFlow
                    locale={locale}
                    unknownLabel={t('usage.unknown')}
                    value={summary.efficiency.totals.costPerHourUsd}
                  />
                }
                detail={
                  formatHourlyCostComparison(
                    summary.periodCompare?.costPerHourUsd,
                    summary.periodDays,
                    locale,
                    t,
                  ) ?? usagePricingDetail(summary, t)
                }
              />
            </div>
          </NumberFlowGroup>

          <UsageHighlights locale={locale} summary={summary} t={t} />

          {error && (
            <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-[13px] text-muted-foreground">
              {error}
            </div>
          )}

          <DashboardPanel
            title={t('usage.costTimeTrend')}
            description={t('usage.costTimeTrendDescription')}
          >
            <CostTimeTrendChart
              chartThemeName={chartThemeName}
              locale={locale}
              summary={summary}
              t={t}
              tokens={tokens}
            />
          </DashboardPanel>

          <DashboardPanel
            title={t('usage.agentContribution')}
            description={t('usage.agentContributionDescription')}
          >
            <AgentContributionChart
              chartThemeName={chartThemeName}
              locale={locale}
              summary={summary}
              t={t}
              tokens={tokens}
            />
          </DashboardPanel>

          <DashboardPanel
            title={t('usage.spendBreakdown')}
            description={t('usage.spendBreakdownDescription')}
          >
            <SpendBreakdown locale={locale} summary={summary} t={t} tokens={tokens} />
          </DashboardPanel>

          <div className="grid gap-5 xl:grid-cols-2">
            <DashboardPanel
              action={
                <RankMetricTabs
                  onValueChange={setProjectRankMetric}
                  t={t}
                  value={projectRankMetric}
                />
              }
              title={t('usage.projectCostRank')}
              description={t('usage.projectCostRankDescription')}
            >
              <RankBarChart
                chartThemeName={chartThemeName}
                kind="project"
                locale={locale}
                metric={projectRankMetric}
                rows={summary.byProject}
                t={t}
                tokens={tokens}
              />
            </DashboardPanel>
            <DashboardPanel
              action={
                <RankMetricTabs onValueChange={setModelRankMetric} t={t} value={modelRankMetric} />
              }
              title={t('usage.modelCostRank')}
              description={t('usage.modelCostRankDescription')}
            >
              <RankBarChart
                chartThemeName={chartThemeName}
                kind="model"
                locale={locale}
                metric={modelRankMetric}
                rows={summary.byModel}
                t={t}
                tokens={tokens}
              />
            </DashboardPanel>
          </div>

          <DashboardPanel
            title={t('usage.tokenBreakdown')}
            description={t('usage.tokenBreakdownDescription')}
          >
            <DailyTokenCompositionChart
              chartThemeName={chartThemeName}
              locale={locale}
              summary={summary}
              t={t}
              tokens={tokens}
            />
          </DashboardPanel>

          <div className="grid gap-5 xl:grid-cols-2">
            <DashboardPanel
              title={t('usage.projectTableTitle')}
              description={t('usage.projectTableDescription')}
            >
              <UsageRankTable
                locale={locale}
                nameLabel={t('usage.project')}
                rows={summary.byProject}
                t={t}
              />
            </DashboardPanel>
            <DashboardPanel
              title={t('usage.modelTableTitle')}
              description={t('usage.modelTableDescription')}
            >
              <UsageRankTable
                locale={locale}
                nameLabel={t('usage.model')}
                rows={summary.byModel}
                t={t}
              />
            </DashboardPanel>
          </div>
        </>
      )}
    </PageShell>
  )
}
