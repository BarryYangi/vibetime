import type { UsageSummaryBreakdownRow, UsageTokenBreakdown } from '@vibetime/core'
import { useAtomValue } from 'jotai'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  DatabaseIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useResolvedColorScheme } from '@/appearance'
import { type EChartsCoreOption, echarts } from '@/charts/echarts'
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
import { formatPeriodLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { UsageAgentFilter, UsageSummary, UsageSummaryArgs } from '../../../shared/ipc-types'
import { HISTORY_PERIODS } from '../../../shared/ipc-types'
import { getChartThemeName, getChartTokens } from '../charts/theme'
import { type TranslationKey, useI18n } from '../i18n'
import {
  clearActiveUsageQuery,
  refreshUsageSummary,
  runUsageRefresh,
  usageRefreshStateAtom,
  usageSummariesAtom,
} from '../store'

type ChartTokens = ReturnType<typeof getChartTokens>
type TFunction = ReturnType<typeof useI18n>['t']
type SortKey = 'label' | 'totalTokens' | 'estimatedCostUsd' | 'unknownCostTokens' | 'recordCount'
type TableRowKind = 'agent' | 'model' | 'project'

const AGENT_FILTERS: Array<{ value: UsageAgentFilter; labelKey?: TranslationKey; label?: string }> =
  [
    { value: 'all', labelKey: 'usage.all' },
    { value: 'claude-code', label: 'Claude Code' },
    { value: 'codex', label: 'Codex' },
  ]

function normalizeUsageSummaryArgs(args: UsageSummaryArgs): UsageSummaryArgs {
  return {
    periodDays: args.periodDays,
    agent: args.agent ?? 'all',
    project: args.project ?? null,
    model: args.model ?? null,
    includeSidechain: args.includeSidechain ?? true,
  }
}

function usageSummaryCacheKey(args: UsageSummaryArgs): string {
  const normalized = normalizeUsageSummaryArgs(args)
  return [
    normalized.periodDays,
    normalized.agent,
    normalized.project ?? '',
    normalized.model ?? '',
    normalized.includeSidechain ? 'with-sidechain' : 'without-sidechain',
  ]
    .map((part) => encodeURIComponent(String(part)))
    .join('|')
}

function axisLabelStyle(tokens: ChartTokens) {
  return { color: tokens.axisLabel, fontFamily: 'SN Pro', fontSize: 11 }
}

function splitLineStyle(tokens: ChartTokens) {
  return { color: tokens.splitLine, width: 1 }
}

function tooltipExtraCss(tokens: ChartTokens) {
  return `box-shadow: 0 8px 24px ${tokens.tooltipShadow}; border-radius: 8px;`
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

function cacheHitRate(tokens: UsageTokenBreakdown): number {
  const cacheTokens = tokens.cachedInputTokens + tokens.cacheCreationInputTokens
  return tokens.inputTokens > 0 ? cacheTokens / tokens.inputTokens : 0
}

function agentLabel(agent: string): string {
  if (agent === 'claude-code') return 'Claude Code'
  if (agent === 'codex') return 'Codex'
  return agent
}

function pricingStatusText(status: UsageSummary['pricingStatus'], t: TFunction): string {
  if (status === 'fresh') return t('usage.pricingRefreshing')
  if (status === 'cached' || status === 'refresh_failed_with_cache') {
    return t('usage.pricingCached')
  }
  if (status === 'unknown_model') return t('usage.unknownModelPrice')
  return t('usage.pricingUnavailable')
}

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

function DailyUsageTrend({
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
    const hasAnyCost = summary.daily.some((day) => day.estimatedCostUsd !== null)
    const metricName = hasAnyCost ? t('usage.estimatedCost') : t('usage.tokens')
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
          params: Array<{
            data: { value: number; tokens: number; cost: number | null }
            name: string
          }>,
        ) => {
          const item = params[0]
          if (!item) return ''
          const cost = item.data.cost
          return `<div style="font-size:12px;color:${tokens.tooltipMuted}">${item.name}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:${tokens.text}">${hasAnyCost ? formatUsd(cost, locale, t('usage.unknown')) : formatTokens(item.data.tokens, locale)}</div><div style="margin-top:2px;color:${tokens.tooltipMuted}">${t('usage.disclaimer')}</div>`
        },
      },
      grid: { left: 44, right: 12, top: 18, bottom: 28 },
      xAxis: {
        type: 'category',
        data: summary.daily.map((day) => day.date.slice(5)),
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
        axisLabel: {
          ...labels,
          formatter: (value: number) =>
            hasAnyCost ? formatUsd(value, locale, t('usage.unknown')) : formatTokens(value, locale),
        },
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      series: [
        {
          name: metricName,
          type: 'bar',
          barMaxWidth: 18,
          data: summary.daily.map((day) => ({
            value: hasAnyCost ? (day.estimatedCostUsd ?? 0) : day.totalTokens,
            tokens: day.totalTokens,
            cost: day.estimatedCostUsd,
          })),
          itemStyle: { borderRadius: [3, 3, 0, 0] },
        },
      ],
    }
  }, [locale, summary.daily, t, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[260px] w-full" />
}

function TokenBreakdownChart({
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
  const rows = useMemo(
    () => [
      { key: 'input', label: t('usage.inputTokens'), value: summary.tokenBreakdown.inputTokens },
      {
        key: 'cached',
        label: t('usage.cachedInputTokens'),
        value: summary.tokenBreakdown.cachedInputTokens,
      },
      {
        key: 'cache-create',
        label: t('usage.cacheCreationTokens'),
        value: summary.tokenBreakdown.cacheCreationInputTokens,
      },
      { key: 'output', label: t('usage.outputTokens'), value: summary.tokenBreakdown.outputTokens },
      {
        key: 'reasoning',
        label: t('usage.reasoningTokens'),
        value: summary.tokenBreakdown.reasoningOutputTokens,
      },
    ],
    [summary.tokenBreakdown, t],
  )
  const option = useMemo<EChartsCoreOption>(() => {
    const labels = axisLabelStyle(tokens)
    return {
      color: [...tokens.seriesPalette],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', z: 0, shadowStyle: { color: tokens.axisPointer } },
        borderWidth: 0,
        confine: true,
        extraCssText: tooltipExtraCss(tokens),
        backgroundColor: tokens.tooltipBg,
        formatter: (params: Array<{ marker: string; seriesName: string; value: number }>) => {
          const rowsHtml = params
            .filter((item) => item.value > 0)
            .map(
              (item) =>
                `<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:4px">${item.marker}<span style="color:${tokens.tooltipRow}">${item.seriesName}</span><span style="font-weight:600;color:${tokens.text}">${formatTokens(item.value, locale)}</span></div>`,
            )
            .join('')
          return (
            rowsHtml || `<div style="color:${tokens.tooltipMuted}">${t('usage.emptyTitle')}</div>`
          )
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
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...labels, formatter: (value: number) => formatTokens(value, locale) },
        splitLine: { lineStyle: splitLineStyle(tokens) },
      },
      yAxis: {
        type: 'category',
        data: [t('usage.tokens')],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: labels,
      },
      series: rows.map((row, index) => ({
        name: row.label,
        type: 'bar',
        stack: 'tokens',
        data: [row.value],
        itemStyle: {
          color: tokens.seriesPalette[index % tokens.seriesPalette.length],
          borderRadius: index === rows.length - 1 ? [0, 4, 4, 0] : 0,
        },
      })),
    }
  }, [locale, rows, t, tokens])
  useChart(ref, option, chartThemeName)
  return <div ref={ref} className="h-[220px] w-full" />
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

function UsageBreakdownTable({
  locale,
  summary,
  t,
}: {
  locale: string
  summary: UsageSummary
  t: TFunction
}) {
  const [sortKey, setSortKey] = useState<SortKey>('totalTokens')
  const [sortAsc, setSortAsc] = useState(false)
  const rows = useMemo(() => {
    const withKind = (
      kind: TableRowKind,
      row: UsageSummaryBreakdownRow,
    ): UsageSummaryBreakdownRow & { kind: TableRowKind } => ({
      ...row,
      kind,
      label: kind === 'agent' ? agentLabel(row.label) : row.label,
    })
    const data = [
      ...summary.byProject.map((row) => withKind('project', row)),
      ...summary.byModel.map((row) => withKind('model', row)),
      ...summary.byAgent.map((row) => withKind('agent', row)),
    ]
    return data.sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortKey === 'label') return a.label.localeCompare(b.label) * dir
      const aValue = a[sortKey] ?? 0
      const bValue = b[sortKey] ?? 0
      return (Number(aValue) - Number(bValue)) * dir
    })
  }, [sortAsc, sortKey, summary.byAgent, summary.byModel, summary.byProject])

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
            <TableHead className="w-[36%]">
              <button onClick={() => changeSort('label')} type="button">
                {t('usage.entityColumn')} <SortIcon active={sortKey === 'label'} asc={sortAsc} />
              </button>
            </TableHead>
            <TableHead className="w-[14%]">{t('usage.type')}</TableHead>
            <TableHead className="w-[18%] text-right">
              <button onClick={() => changeSort('totalTokens')} type="button">
                {t('usage.tokens')} <SortIcon active={sortKey === 'totalTokens'} asc={sortAsc} />
              </button>
            </TableHead>
            <TableHead className="w-[18%] text-right">
              <button onClick={() => changeSort('estimatedCostUsd')} type="button">
                {t('usage.cost')} <SortIcon active={sortKey === 'estimatedCostUsd'} asc={sortAsc} />
              </button>
            </TableHead>
            <TableHead className="w-[14%] text-right">
              <button onClick={() => changeSort('recordCount')} type="button">
                {t('usage.rows')} <SortIcon active={sortKey === 'recordCount'} asc={sortAsc} />
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-muted-foreground" colSpan={5}>
                {t('usage.noTableData')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={`${row.kind}:${row.key}`}>
                <TableCell className="truncate font-medium" title={row.label}>
                  {row.label}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t(`usage.${row.kind}` as TranslationKey)}
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

function AuditPanel({
  locale,
  summary,
  t,
}: {
  locale: string
  summary: UsageSummary
  t: TFunction
}) {
  return (
    <div className="flex min-h-[260px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/40 pb-4 text-[13px]">
        <div className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="text-muted-foreground">
            {pricingStatusText(summary.pricingStatus, t)}
          </span>
        </div>
        <div className="inline-flex items-center gap-2 text-muted-foreground">
          <DatabaseIcon aria-hidden="true" className="size-4" />
          {t('usage.claudeCodexOnly')}
        </div>
      </div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[34%]">{t('usage.auditTable')}</TableHead>
            <TableHead className="w-[18%]">{t('usage.model')}</TableHead>
            <TableHead className="w-[18%]">{t('usage.attribution')}</TableHead>
            <TableHead className="w-[15%] text-right">{t('usage.tokens')}</TableHead>
            <TableHead className="w-[15%] text-right">{t('usage.cost')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.auditRows.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-muted-foreground" colSpan={5}>
                {t('usage.noAuditIssues')}
              </TableCell>
            </TableRow>
          ) : (
            summary.auditRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="truncate font-medium" title={row.label}>
                  {row.key === 'unassigned' ? t('usage.unassigned') : row.label}
                </TableCell>
                <TableCell className="truncate text-muted-foreground" title={row.model ?? '-'}>
                  {row.model ?? '-'}
                </TableCell>
                <TableCell className="truncate text-muted-foreground">
                  {row.attributionMethod ?? '-'}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatTokens(row.totalTokens, locale)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd(row.estimatedCostUsd, locale, t('usage.unknown'))}
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
  const [error, setError] = useState<string | null>(null)
  const [visibleSummary, setVisibleSummary] = useState<UsageSummary | null>(null)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const openRefreshStartedRef = useRef(false)
  const usageSummaries = useAtomValue(usageSummariesAtom)
  const refreshState = useAtomValue(usageRefreshStateAtom)
  const args = useMemo<UsageSummaryArgs>(
    () => ({ periodDays, agent, project, model, includeSidechain: true }),
    [agent, model, periodDays, project],
  )
  const exactSummary = usageSummaries[usageSummaryCacheKey(args)] ?? null
  const summary = exactSummary ?? visibleSummary
  const chartThemeName = getChartThemeName(colorScheme)
  const tokens = getChartTokens(colorScheme)

  useEffect(() => {
    if (exactSummary) setVisibleSummary(exactSummary)
  }, [exactSummary])

  useEffect(() => {
    let alive = true
    setError(null)
    refreshUsageSummary(args)
      .then((result) => {
        if (!alive) return
        if (result && !result.ok) setError(result.error)
      })
      .catch((err) => {
        if (alive) setError(String(err))
      })
    return () => {
      alive = false
    }
  }, [args])

  useEffect(() => {
    if (openRefreshStartedRef.current) return
    openRefreshStartedRef.current = true
    let alive = true
    runUsageRefresh().then((result) => {
      if (!alive || !result?.ok) return
      void refreshUsageSummary(args)
    })
    return () => {
      alive = false
      clearActiveUsageQuery()
    }
  }, [args])

  const handleManualRefresh = async () => {
    setManualRefreshing(true)
    setError(null)
    try {
      const result = await runUsageRefresh()
      if (result?.ok) {
        const summaryResult = await refreshUsageSummary(args)
        if (summaryResult && !summaryResult.ok) setError(summaryResult.error)
      } else if (result && !result.ok) {
        setError(result.error)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setManualRefreshing(false)
    }
  }

  const topModel = summary?.byModel[0]
  const topAgent = summary?.byAgent[0]
  const topMix = topModel?.label ?? (topAgent ? agentLabel(topAgent.label) : t('usage.none'))
  const isLoading = summary !== null && exactSummary === null
  const hasData = (summary?.totals.recordCount ?? 0) > 0
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

  if (error && !summary) {
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
          {(isLoading || refreshState.status === 'loading') && (
            <Spinner className="mr-1 text-muted-foreground" />
          )}
          <Tabs
            onValueChange={(value) => setPeriodDays(Number(value) as UsageSummary['periodDays'])}
            value={String(periodDays)}
          >
            <TabsList className="h-7">
              {HISTORY_PERIODS.map((days) => (
                <TabsTab className="h-6 px-2 text-[12px]" key={days} value={String(days)}>
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
            disabled={manualRefreshing}
            loading={manualRefreshing}
            onClick={handleManualRefresh}
            size="sm"
            variant="secondary"
          >
            <RefreshCwIcon aria-hidden="true" />
            {t('usage.refresh')}
          </Button>
        </div>
      </header>

      {!summary ? (
        <div className="rounded-xl border border-border/60 bg-card/40 px-5 py-12 text-center text-[13px] text-muted-foreground">
          <Spinner className="mx-auto mb-3" />
          {t('usage.loading')}
        </div>
      ) : !hasData ? (
        <div className="rounded-xl border border-border/60 bg-card/40 px-5 py-12 text-center">
          <h2 className="text-[20px] font-semibold text-foreground">{t('usage.emptyTitle')}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">{t('usage.emptyDescription')}</p>
          <p className="mt-4 text-[12px] text-muted-foreground">{t('usage.claudeCodexOnly')}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-4">
            <StatTile
              label={t('usage.estimatedCost')}
              value={formatUsd(summary.totals.estimatedCostUsd, locale, t('usage.unknown'))}
              detail={t('usage.disclaimer')}
            />
            <StatTile
              label={t('usage.totalTokens')}
              value={formatTokens(summary.totals.totalTokens, locale)}
              detail={`${summary.totals.recordCount} ${t('usage.usageRows')}`}
            />
            <StatTile
              label={t('usage.cacheHitRate')}
              value={formatPercent(cacheHitRate(summary.tokenBreakdown))}
              detail={`${formatTokens(
                summary.tokenBreakdown.cachedInputTokens +
                  summary.tokenBreakdown.cacheCreationInputTokens,
                locale,
              )} ${t('usage.cachedTokens')}`}
            />
            <StatTile
              label={t('usage.topModel')}
              value={topMix}
              detail={pricingStatusText(summary.pricingStatus, t)}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-[13px] text-muted-foreground">
              {error}
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <DashboardPanel
              title={t('usage.dailyUsageTrend')}
              description={t('usage.dailyUsageTrendDescription')}
            >
              <DailyUsageTrend
                chartThemeName={chartThemeName}
                locale={locale}
                summary={summary}
                t={t}
                tokens={tokens}
              />
            </DashboardPanel>
            <DashboardPanel
              title={t('usage.tokenBreakdown')}
              description={t('usage.tokenBreakdownDescription')}
            >
              <TokenBreakdownChart
                chartThemeName={chartThemeName}
                locale={locale}
                summary={summary}
                t={t}
                tokens={tokens}
              />
            </DashboardPanel>
          </div>

          <DashboardPanel title={t('usage.tableTitle')} description={t('usage.tableDescription')}>
            <UsageBreakdownTable locale={locale} summary={summary} t={t} />
          </DashboardPanel>

          <DashboardPanel title={t('usage.auditTitle')} description={t('usage.auditDescription')}>
            <AuditPanel locale={locale} summary={summary} t={t} />
          </DashboardPanel>
        </>
      )}
    </PageShell>
  )
}
