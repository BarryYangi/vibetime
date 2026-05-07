import * as echarts from 'echarts'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

function formatLastActive(ts: number | null): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sumTrendDay(day: HistorySummary['trends'][number]): number {
  return Object.values(day.projects).reduce((sum, value) => sum + value, 0)
}

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T00:00:00`).getDay()
  return day === 0 ? 6 : day - 1
}

function useChart(
  ref: React.RefObject<HTMLDivElement | null>,
  options: echarts.EChartsCoreOption | null,
) {
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
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
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
        range: [
          summary.calendar[0]?.date,
          summary.calendar[summary.calendar.length - 1]?.date,
        ],
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
          emphasis: {
            itemStyle: {
              borderColor: '#262626',
              borderWidth: 1,
              shadowBlur: 8,
              shadowColor: 'rgba(0,0,0,0.14)',
            },
          },
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
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      color: chartPalette,
      tooltip: {
        trigger: 'axis',
        borderWidth: 0,
        confine: true,
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
        axisPointer: { type: 'shadow', shadowStyle: { color: '#0000000a' } },
        formatter: (params: Array<{ marker: string; seriesName: string; value: number; axisValue: string }>) => {
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
          borderRadius:
            index === summary.trendProjects.length - 1
              ? [3, 3, 0, 0]
              : 0,
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
    () =>
      [...summary.topProjects]
        .sort((a, b) => a.total - b.total)
        .slice(-6),
    [summary.topProjects],
  )
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const option = useMemo<echarts.EChartsCoreOption>(
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
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => formatTooltipDuration(value) },
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
            itemStyle: { color: chartPalette[index % chartPalette.length], borderRadius: [0, 4, 4, 0] },
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

function WeekdayRhythmChart({ summary }: { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const values = useMemo(() => {
    const totals = Array.from({ length: 7 }, () => 0)
    for (const day of summary.trends) {
      totals[weekdayIndex(day.date)] += sumTrendDay(day)
    }
    return totals
  }, [summary.trends])
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      color: ['#216e39'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: '#0000000a' } },
        borderWidth: 0,
        confine: true,
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0]
          return item
            ? `<div style="font-size:12px;color:#737373">${item.name}</div><div style="margin-top:2px;font-size:13px;font-weight:600;color:#262626">${formatTooltipDuration(item.value)}</div>`
            : ''
        },
      },
      grid: { left: 34, right: 12, top: 10, bottom: 26 },
      xAxis: {
        type: 'category',
        data: weekdayLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => formatTooltipDuration(value) },
        splitLine: { lineStyle: splitLineStyle },
      },
      series: [
        {
          type: 'bar',
          data: values.map((value) => ({
            value,
            itemStyle: { borderRadius: [4, 4, 0, 0] },
          })),
          barWidth: 18,
        },
      ],
    }),
    [values],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[220px] w-full" />
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null
  const Icon = asc ? ArrowUpIcon : ArrowDownIcon
  return <Icon aria-hidden className="ml-1 inline size-3" />
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-4 py-3">
      <p className="text-[11px] font-medium text-muted-foreground leading-snug">{label}</p>
      <p className="mt-2 font-mono text-[22px] font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-2 truncate text-[12px] text-muted-foreground leading-snug">{detail}</p>
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
    const turnCount = summary.topProjects.reduce((sum, project) => sum + project.turns, 0)
    const topProject = summary.topProjects[0]
    return {
      activeDays,
      averageActiveDay: activeDays > 0 ? periodTotal / activeDays : 0,
      bestDay,
      periodTotal,
      topProject,
      turnCount,
    }
  }, [summary])

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
            detail={`${stats.turnCount} completed turns`}
            label={`${summary.periodDays}-day total`}
            value={formatDuration(stats.periodTotal)}
          />
          <StatTile
            detail={`${stats.activeDays} active days`}
            label="Avg active day"
            value={formatDuration(stats.averageActiveDay)}
          />
          <StatTile
            detail={stats.bestDay.date || 'No activity'}
            label="Best day"
            value={formatDuration(stats.bestDay.total)}
          />
          <StatTile
            detail={stats.topProject?.project ?? 'No project'}
            label="Top project"
            value={stats.topProject ? formatDuration(stats.topProject.total) : '0s'}
          />
        </section>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-1">
          <CardTitle>Contribution heatmap</CardTitle>
          <CardDescription>Last 365 days, GitHub-style intensity</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <CalendarHeatmap summary={summary} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-1">
          <CardTitle>Project trends</CardTitle>
          <CardDescription>Daily stacked duration by project</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
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
            <ProjectShareChart summary={summary} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle>Weekday rhythm</CardTitle>
            <CardDescription>Distribution across the selected period</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <WeekdayRhythmChart summary={summary} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Top Projects</CardTitle>
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
                  <TableCell className="px-3 py-3 font-mono tabular-nums">{formatDuration(row.total)}</TableCell>
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
