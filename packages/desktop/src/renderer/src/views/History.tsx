import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type EChartsCoreOption, echarts } from '@/charts/echarts'
import { PageShell } from '@/components/PageShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { HistorySummary, TopProjectRow } from '../../../shared/ipc-types'
import '../charts/theme'

const PERIODS = [7, 30, 90, 365] as const
type SortKey = 'project' | 'total' | 'turns' | 'lastActive'

const chartPalette = ['#2563eb', '#10b981', '#f59e0b', '#e11d48', '#7c3aed', '#737373']
const githubHeatmapPalette = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const axisLabelStyle = { color: '#737373', fontSize: 11, fontFamily: 'SN Pro' }
const splitLineStyle = { color: '#0000000f', width: 1 }
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const heatmapHoverEmphasis = {
  itemStyle: {
    borderColor: 'rgba(115,115,115,0.55)',
    borderWidth: 1,
    borderRadius: 2,
  },
} as const
const hourlyHeatmapHoverEmphasis = {
  itemStyle: {
    borderColor: 'rgba(115,115,115,0.55)',
    borderWidth: 1,
    borderRadius: 4,
  },
} as const

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  if (whole < 3600) return `${Math.floor(whole / 60)}m`
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  return `${h}h ${m}m`
}

function formatTooltipDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  if (whole < 3600) return `${Math.round(whole / 60)}m`
  const h = Math.floor(whole / 3600)
  const m = Math.round((whole % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatDelta(ratio: number | null): string {
  if (ratio === null) return 'no prior period'
  const pct = Math.round(ratio * 100)
  return `${pct >= 0 ? '+' : ''}${pct}% vs previous`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatLastActive(ts: number | null): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sumTrendDay(day: HistorySummary['trends'][number]): number {
  return Object.values(day.projects).reduce((sum, value) => sum + value, 0)
}

function formatHourWindow(weekday: number, hour: number): string {
  return `${weekdayLabels[weekday] ?? '-'} ${String(hour).padStart(2, '0')}:00`
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

function useChart(ref: React.RefObject<HTMLDivElement | null>, options: EChartsCoreOption | null) {
  useEffect(() => {
    if (!ref.current || !options) return
    const chart = echarts.init(ref.current, 'cossNeutral')
    chart.setOption(options)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [options, ref])
}

function CalendarHeatmap({ summary }: { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const values = summary.calendar.map((day) => [day.date, day.total])
  const max = Math.max(1, ...values.map(([, total]) => Number(total)))
  const option = useMemo<EChartsCoreOption>(
    () => ({
      stateAnimation: { duration: 0 },
      tooltip: {
        borderWidth: 0,
        confine: true,
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
        formatter: (params: { value: [string, number] }) =>
          `<div style="font-size:12px;color:#737373">${params.value[0]}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:#262626">${formatTooltipDuration(params.value[1])}</div>`,
      },
      visualMap: {
        min: 0,
        max,
        show: false,
        inRange: { color: githubHeatmapPalette },
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
          borderWidth: 2,
          borderColor: '#ffffff',
          borderRadius: 2,
        },
        yearLabel: { show: false },
        monthLabel: { color: '#737373', fontSize: 11, margin: 7 },
        dayLabel: {
          color: '#a3a3a3',
          firstDay: 1,
          fontSize: 10,
          margin: 7,
          nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: values,
          emphasis: heatmapHoverEmphasis,
          itemStyle: { borderRadius: 2 },
        },
      ],
    }),
    [max, summary.calendar, values],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[138px] w-full" />
}

function TrendChart({ summary }: { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsCoreOption>(
    () => ({
      color: chartPalette,
      tooltip: {
        trigger: 'axis',
        borderWidth: 0,
        confine: true,
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
        axisPointer: { type: 'shadow', shadowStyle: { color: '#0000000a' } },
        formatter: (
          params: Array<{ marker: string; seriesName: string; value: number; axisValue: string }>,
        ) => {
          const rows = params
            .filter((item) => item.value > 0)
            .map(
              (item) =>
                `<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:4px">${item.marker}<span style="color:#404040">${item.seriesName}</span><span style="font-weight:600;color:#262626">${formatTooltipDuration(item.value)}</span></div>`,
            )
            .join('')
          return `<div style="font-size:12px;color:#737373">${params[0]?.axisValue ?? ''}</div>${rows || '<div style="margin-top:4px;color:#737373">No activity</div>'}`
        },
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemHeight: 8,
        itemWidth: 14,
        textStyle: axisLabelStyle,
      },
      grid: { left: 34, right: 10, top: 34, bottom: 26 },
      xAxis: {
        type: 'category',
        boundaryGap: true,
        data: summary.trends.map((day) => day.date.slice(5)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...axisLabelStyle,
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
          ...axisLabelStyle,
          formatter: (value: number) => formatTooltipDuration(value),
        },
        splitLine: { lineStyle: splitLineStyle },
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
    }),
    [summary.trendProjects, summary.trends],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[260px] w-full" />
}

function ProjectShareChart({ summary }: { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const rows = useMemo(
    () => [...summary.topProjects].sort((a, b) => a.total - b.total).slice(-6),
    [summary.topProjects],
  )
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const option = useMemo<EChartsCoreOption>(
    () => ({
      color: ['#262626'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: '#0000000a' } },
        borderWidth: 0,
        confine: true,
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0]
          if (!item) return ''
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
          return `<div style="font-size:12px;color:#737373">${item.name}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:#262626">${formatTooltipDuration(item.value)} · ${pct}%</div>`
        },
      },
      grid: { left: 88, right: 18, top: 8, bottom: 18 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...axisLabelStyle,
          formatter: (value: number) => formatTooltipDuration(value),
        },
        splitLine: { lineStyle: splitLineStyle },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.project),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabelStyle, width: 76, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: rows.map((row, index) => ({
            value: row.total,
            itemStyle: {
              color: chartPalette[index % chartPalette.length],
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 10,
        },
      ],
    }),
    [rows, total],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[220px] w-full" />
}

function HourlyActivityHeatmap({ summary }: { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const max = Math.max(1, ...summary.hourlyMatrix.map((cell) => cell.total))
  const option = useMemo<EChartsCoreOption>(
    () => ({
      stateAnimation: { duration: 0 },
      tooltip: {
        borderWidth: 0,
        confine: true,
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
        formatter: (params: { value: [number, number, number] }) => {
          const [hour, weekday, total] = params.value
          return `<div style="font-size:12px;color:#737373">${weekdayLabels[weekday]} · ${String(hour).padStart(2, '0')}:00</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:#262626">${formatTooltipDuration(total)}</div>`
        },
      },
      grid: { left: 34, right: 14, top: 10, bottom: 28 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabelStyle, interval: 2 },
      },
      yAxis: {
        type: 'category',
        data: weekdayLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
      },
      visualMap: {
        min: 0,
        max,
        show: false,
        inRange: { color: ['#f7f7f7', '#dbeafe', '#93c5fd', '#3b82f6', '#1e3a8a'] },
      },
      series: [
        {
          type: 'heatmap',
          data: summary.hourlyMatrix.map((cell) => [cell.hour, cell.weekday, cell.total]),
          emphasis: hourlyHeatmapHoverEmphasis,
          itemStyle: { borderColor: '#ffffff', borderRadius: 4, borderWidth: 1 },
        },
      ],
    }),
    [max, summary.hourlyMatrix],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[220px] w-full" />
}

function TurnLengthBuckets({ summary }: { summary: HistorySummary }) {
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
        label: range.label,
        count: turns.length,
        total: turns.reduce((sum, turn) => sum + turn.duration, 0),
      }
    })
  }, [summary.turnDurations])
  const totalTurns = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const option = useMemo<EChartsCoreOption>(
    () => ({
      color: ['#2563eb'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: '#0000000a' } },
        borderWidth: 0,
        confine: true,
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
        formatter: (params: Array<{ dataIndex: number; name: string }>) => {
          const item = params[0]
          const bucket = item ? buckets[item.dataIndex] : undefined
          if (!item || !bucket) return ''
          const pct = totalTurns > 0 ? Math.round((bucket.count / totalTurns) * 100) : 0
          return `<div style="font-size:12px;color:#737373">${item.name}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:#262626">${bucket.count} turns · ${pct}%</div><div style="margin-top:2px;color:#737373">${formatTooltipDuration(bucket.total)} total</div>`
        },
      },
      grid: { left: 34, right: 12, top: 18, bottom: 28 },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => bucket.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
        splitLine: { lineStyle: splitLineStyle },
      },
      series: [
        {
          type: 'bar',
          data: buckets.map((bucket, index) => ({
            value: bucket.count,
            itemStyle: {
              color: index === 0 ? '#f59e0b' : index >= 3 ? '#10b981' : '#2563eb',
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 34,
          label: {
            show: true,
            position: 'top',
            color: '#737373',
            fontSize: 11,
            formatter: ({ value }: { value: number }) => String(value),
          },
        },
      ],
    }),
    [buckets, totalTurns],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[220px] w-full" />
}

function AgentContributionBars({ summary }: { summary: HistorySummary }) {
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
  const agentColorByName = useMemo(
    () =>
      new Map(
        agentTotals.map(([agent], index) => [agent, chartPalette[index % chartPalette.length]]),
      ),
    [agentTotals],
  )

  if (rows.length === 0) {
    return (
      <div className="py-8 text-[13px] text-muted-foreground">
        No agent activity in this period.
      </div>
    )
  }

  return (
    <div className="flex min-h-[220px] flex-col justify-between gap-4 pt-2">
      <div className="space-y-4">
        {rows.map((project) => (
          <div key={project.project}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="truncate text-[13px] font-medium">{project.project}</p>
              <p className="shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">
                {formatDuration(project.total)}
              </p>
            </div>
            <div className="flex h-3 overflow-hidden rounded-sm bg-muted">
              {project.agents.map((agent, index) => {
                const pct = project.total > 0 ? (agent.total / project.total) * 100 : 0
                return (
                  <div
                    className="border-r border-background last:border-r-0"
                    key={agent.agent}
                    style={{
                      width: `${pct}%`,
                      backgroundColor:
                        agentColorByName.get(agent.agent) ??
                        chartPalette[index % chartPalette.length],
                    }}
                    title={`${agent.agent}: ${formatDuration(agent.total)} (${Math.round(pct)}%)`}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/40 pt-3">
        {agentTotals.map(([agent, total], index) => (
          <div className="flex items-center gap-2 text-[12px]" key={agent}>
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{
                backgroundColor:
                  agentColorByName.get(agent) ?? chartPalette[index % chartPalette.length],
              }}
            />
            <span className="text-muted-foreground">{agent}</span>
            <span className="font-mono tabular-nums">{formatDuration(total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopProjectSignals({ summary }: { summary: HistorySummary }) {
  const rows = useMemo(() => {
    const durationsByProject = new Map<string, number[]>()
    for (const turn of summary.turnDurations) {
      const values = durationsByProject.get(turn.project) ?? []
      values.push(turn.duration)
      durationsByProject.set(turn.project, values)
    }
    return summary.topProjects.slice(0, 5).map((project) => {
      const values = (durationsByProject.get(project.project) ?? []).sort((a, b) => a - b)
      const median = quantile(values, 0.5)
      const focusTurns = values.filter((value) => value >= 25 * 60).length
      return { ...project, focusTurns, median }
    })
  }, [summary.turnDurations, summary.topProjects])

  return (
    <div className="space-y-2 pt-1">
      {rows.map((row) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_76px_64px_76px] items-center gap-3 border-b border-border/30 py-2.5 last:border-b-0"
          key={row.project}
        >
          <p className="truncate text-[13px] font-medium">{row.project}</p>
          <p className="font-mono text-[12px] tabular-nums">{formatDuration(row.total)}</p>
          <p className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {row.focusTurns} focus
          </p>
          <p className="text-right font-mono text-[12px] text-muted-foreground tabular-nums">
            med {formatDuration(row.median)}
          </p>
        </div>
      ))}
    </div>
  )
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null
  const Icon = asc ? ArrowUpIcon : ArrowDownIcon
  return <Icon aria-hidden className="ml-1 inline size-3" />
}

function StatTile({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-950 dark:bg-emerald-950/20'
      : tone === 'warn'
        ? 'border-amber-200/80 bg-amber-50/70 dark:border-amber-950 dark:bg-amber-950/20'
        : 'border-border/55 bg-card'
  return (
    <div className={`rounded-lg border px-4 py-3 shadow-sm shadow-black/[0.02] ${toneClass}`}>
      <p className="text-[11px] font-medium text-muted-foreground leading-snug">{label}</p>
      <p className="mt-2 font-mono text-[22px] font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-2 truncate text-[12px] text-muted-foreground leading-snug">{detail}</p>
    </div>
  )
}

function InsightBar({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }>
}) {
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-3">
      {items.map((item) => {
        const toneClass =
          item.tone === 'good'
            ? 'border-emerald-200/70 bg-emerald-50/60 text-emerald-950 dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100'
            : item.tone === 'warn'
              ? 'border-amber-200/80 bg-amber-50/60 text-amber-950 dark:border-amber-950 dark:bg-amber-950/20 dark:text-amber-100'
              : 'border-border/45 bg-muted/35 text-foreground'
        return (
          <div
            className={`rounded-md border px-3 py-2 ${toneClass}`}
            key={`${item.label}-${item.value}`}
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-1 truncate text-[13px] font-medium">{item.value}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function History() {
  const [periodDays, setPeriodDays] = useState<HistorySummary['periodDays']>(30)
  const [summary, setSummary] = useState<HistorySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    let alive = true
    setError(null)
    window.api
      .invoke('getHistorySummary', { periodDays })
      .then((result) => {
        if (!alive) return
        if (result.ok) setSummary(result.data)
        else setError(result.error)
      })
      .catch((err) => {
        if (alive) setError(String(err))
      })
    return () => {
      alive = false
    }
  }, [periodDays])

  const sortedRows = useMemo(() => {
    const rows = [...(summary?.topProjects ?? [])]
    return rows.sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortKey === 'project') return a.project.localeCompare(b.project) * dir
      const aValue = a[sortKey] ?? 0
      const bValue = b[sortKey] ?? 0
      return (Number(aValue) - Number(bValue)) * dir
    })
  }, [sortAsc, sortKey, summary?.topProjects])

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
    const [topAgentName = 'No agent', topAgentTotal = 0] =
      [...topAgentTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    const focusShare = stats.turnCount > 0 ? stats.focusTurns / stats.turnCount : 0
    const activeDayRate = stats.activeDays / summary.periodDays
    return {
      activeCalendarDays,
      activeDayRate,
      bestCalendarDay,
      focusShare,
      currentStreak,
      topAgentName,
      topAgentShare: agentGrandTotal > 0 ? topAgentTotal / agentGrandTotal : 0,
      topAgentTotal,
    }
  }, [stats, summary])

  if (!summary && !error) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!summary || summary.topProjects.length === 0) {
    return (
      <PageShell className="py-8" fluid>
        <header>
          <h1 className="font-heading text-2xl font-semibold">History</h1>
        </header>
        <div className="mt-8">
          <h2 className="font-heading text-xl font-semibold">No history yet</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {error ?? 'Captured turns will appear here after your first completed session.'}
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex flex-col gap-5 py-7 sm:px-7 sm:py-8" fluid>
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted-foreground">Retrospective analytics</p>
          <h1 className="font-heading text-2xl font-semibold">History</h1>
        </div>
        <div className="flex rounded-lg border border-border p-1">
          {PERIODS.map((period) => (
            <button
              className={`h-7 rounded-md px-3 text-[12px] font-medium ${periodDays === period ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
              key={period}
              onClick={() => setPeriodDays(period)}
              type="button"
            >
              {period}d
            </button>
          ))}
        </div>
      </header>

      {stats && (
        <section className="grid gap-3 md:grid-cols-4">
          <StatTile
            detail={formatDelta(summary.periodCompare.deltaRatio)}
            label={`${summary.periodDays}-day total`}
            value={formatDuration(stats.periodTotal)}
            tone={
              summary.periodCompare.deltaRatio === null || summary.periodCompare.deltaRatio >= 0
                ? 'good'
                : 'warn'
            }
          />
          <StatTile
            detail={`${stats.turnCount} turns · p75 ${formatDuration(stats.p75Turn)}`}
            label="Median turn"
            value={formatDuration(stats.medianTurn)}
          />
          <StatTile
            detail={`${Math.round(stats.shortTurnRate * 100)}% under 5m`}
            label="Focus blocks"
            value={`${stats.focusTurns}`}
            tone={stats.shortTurnRate > 0.35 ? 'warn' : 'neutral'}
          />
          <StatTile
            detail={`${formatDuration(stats.peakHour.total)} · ${stats.topProject?.project ?? 'No project'} ${Math.round(stats.topProjectShare * 100)}%`}
            label="Peak rhythm"
            value={formatHourWindow(stats.peakHour.weekday, stats.peakHour.hour)}
          />
        </section>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-1">
          <CardTitle>Contribution heatmap</CardTitle>
          <CardDescription>Last 365 days, GitHub-style intensity</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {insights && (
            <InsightBar
              items={[
                { label: 'Active days', value: `${insights.activeCalendarDays} / 365` },
                {
                  label: 'Current streak',
                  value: `${insights.currentStreak} days`,
                  tone: insights.currentStreak >= 5 ? 'good' : 'neutral',
                },
                {
                  label: 'Best day',
                  value: `${insights.bestCalendarDay.date.slice(5)} · ${formatDuration(insights.bestCalendarDay.total)}`,
                },
              ]}
            />
          )}
          <CalendarHeatmap summary={summary} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-1">
          <CardTitle>Project trends</CardTitle>
          <CardDescription>Daily stacked duration by project</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {stats && (
            <InsightBar
              items={[
                {
                  label: 'Change',
                  value: formatDelta(summary.periodCompare.deltaRatio),
                  tone:
                    summary.periodCompare.deltaRatio === null ||
                    summary.periodCompare.deltaRatio >= 0
                      ? 'good'
                      : 'warn',
                },
                {
                  label: 'Active days',
                  value: `${stats.activeDays} / ${summary.periodDays}`,
                  tone: insights && insights.activeDayRate >= 0.7 ? 'good' : 'neutral',
                },
                {
                  label: 'Best day',
                  value: `${stats.bestDay.date.slice(5)} · ${formatDuration(stats.bestDay.total)}`,
                },
              ]}
            />
          )}
          <TrendChart summary={summary} />
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle>Project share</CardTitle>
            <CardDescription>Where time went in the selected period</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {stats && (
              <InsightBar
                items={[
                  {
                    label: 'Top project',
                    value: `${stats.topProject?.project ?? 'No project'} · ${formatPercent(stats.topProjectShare)}`,
                    tone: stats.topProjectShare > 0.65 ? 'warn' : 'neutral',
                  },
                  {
                    label: 'Avg active day',
                    value: formatDuration(stats.averageActiveDay),
                  },
                  {
                    label: 'Turns',
                    value: `${stats.turnCount}`,
                  },
                ]}
              />
            )}
            <ProjectShareChart summary={summary} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle>Hourly rhythm</CardTitle>
            <CardDescription>Weekday x hour intensity</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {stats && (
              <InsightBar
                items={[
                  {
                    label: 'Peak window',
                    value: formatHourWindow(stats.peakHour.weekday, stats.peakHour.hour),
                    tone: 'good',
                  },
                  {
                    label: 'Peak total',
                    value: formatDuration(stats.peakHour.total),
                  },
                  {
                    label: 'Best day',
                    value: stats.bestDay.date.slice(5) || '-',
                  },
                ]}
              />
            )}
            <HourlyActivityHeatmap summary={summary} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle>Turn length buckets</CardTitle>
            <CardDescription>Fragmented turns vs focus blocks</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {stats && insights && (
              <InsightBar
                items={[
                  {
                    label: 'Focus share',
                    value: formatPercent(insights.focusShare),
                    tone: insights.focusShare >= 0.35 ? 'good' : 'neutral',
                  },
                  {
                    label: 'Fragmented',
                    value: formatPercent(stats.shortTurnRate),
                    tone: stats.shortTurnRate > 0.35 ? 'warn' : 'neutral',
                  },
                  {
                    label: 'Median',
                    value: formatDuration(stats.medianTurn),
                  },
                ]}
              />
            )}
            <TurnLengthBuckets summary={summary} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle>Agent contribution</CardTitle>
            <CardDescription>Agent split inside top projects</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {insights && (
              <InsightBar
                items={[
                  {
                    label: 'Top agent',
                    value: insights.topAgentName,
                  },
                  {
                    label: 'Share',
                    value: formatPercent(insights.topAgentShare),
                    tone: insights.topAgentShare > 0.75 ? 'warn' : 'neutral',
                  },
                  {
                    label: 'Total',
                    value: formatDuration(insights.topAgentTotal),
                  },
                ]}
              />
            )}
            <AgentContributionBars summary={summary} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Project signals</CardTitle>
          <CardDescription>Total time, focus blocks, and median turn length</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <TopProjectSignals summary={summary} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Top projects</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table className="text-[13px]">
            <TableHeader className="[&_tr]:border-border/35">
              <TableRow className="border-border/35">
                {(['project', 'total', 'turns', 'lastActive'] as const).map((key) => (
                  <TableHead className="h-8 px-3 text-[11px]" key={key}>
                    <button
                      className="inline-flex items-center"
                      onClick={() => changeSort(key)}
                      type="button"
                    >
                      {key === 'project'
                        ? 'Project'
                        : key === 'lastActive'
                          ? 'Last Active'
                          : key === 'total'
                            ? 'Total'
                            : 'Turns'}
                      <SortIcon active={sortKey === key} asc={sortAsc} />
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row: TopProjectRow) => (
                <TableRow className="border-border/25" key={row.project}>
                  <TableCell className="px-3 py-3">{row.project}</TableCell>
                  <TableCell className="px-3 py-3 font-mono tabular-nums">
                    {formatDuration(row.total)}
                  </TableCell>
                  <TableCell className="px-3 py-3 font-mono tabular-nums">{row.turns}</TableCell>
                  <TableCell className="px-3 py-3">{formatLastActive(row.lastActive)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  )
}
