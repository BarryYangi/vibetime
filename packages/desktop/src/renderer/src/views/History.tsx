import * as echarts from 'echarts'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  if (whole < 3600) return `${Math.floor(whole / 60)}m`
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  return `${h}h ${m}m`
}

function formatLastActive(ts: number | null): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  const values = summary.calendar.map((day) => [day.date, Math.round(day.total / 60)])
  const max = Math.max(1, ...values.map(([, total]) => Number(total)))
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      tooltip: { formatter: (params: { value: [string, number] }) => `${params.value[0]}<br/>${params.value[1]}m` },
      visualMap: {
        min: 0,
        max,
        show: false,
        inRange: { color: ['#f5f5f5', '#d4d4d4', '#737373', '#262626'] },
      },
      calendar: {
        top: 18,
        left: 28,
        right: 18,
        bottom: 8,
        cellSize: ['auto', 14],
        range: [
          summary.calendar[0]?.date,
          summary.calendar[summary.calendar.length - 1]?.date,
        ],
        itemStyle: { borderWidth: 2, borderColor: 'transparent' },
        yearLabel: { show: false },
        monthLabel: { color: '#737373', fontSize: 11 },
        dayLabel: { color: '#737373', fontSize: 10 },
      },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: values }],
    }),
    [max, summary.calendar, values],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[190px] w-full" />
}

function TrendChart({ summary }: { summary: HistorySummary }) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 36, right: 18, top: 18, bottom: 28 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: summary.trends.map((day) => day.date.slice(5)),
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (value: number) => `${Math.round(value / 60)}m` },
      },
      series: summary.trendProjects.map((project) => ({
        name: project,
        type: 'line',
        stack: 'total',
        areaStyle: {},
        showSymbol: false,
        emphasis: { focus: 'series' },
        data: summary.trends.map((day) => day.projects[project] ?? 0),
      })),
    }),
    [summary.trendProjects, summary.trends],
  )
  useChart(ref, option)
  return <div ref={ref} className="h-[240px] w-full" />
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null
  const Icon = asc ? ArrowUpIcon : ArrowDownIcon
  return <Icon aria-hidden className="ml-1 inline size-3" />
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
    <PageShell className="flex flex-col gap-6 py-7 sm:px-7 sm:py-8" fluid>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>365-day heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarHeatmap summary={summary} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Project trends</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart summary={summary} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Top Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {(['project', 'total', 'turns', 'lastActive'] as const).map((key) => (
                  <TableHead key={key}>
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
                <TableRow key={row.project}>
                  <TableCell>{row.project}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatDuration(row.total)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.turns}</TableCell>
                  <TableCell>{formatLastActive(row.lastActive)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  )
}
