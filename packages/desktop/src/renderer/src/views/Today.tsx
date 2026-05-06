import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageShell } from '@/components/PageShell'
import { Spinner } from '@/components/ui/spinner'
import { useIpcQuery } from '../hooks/useIpcQuery'
import { openTurnsAtom, todaySummaryAtom } from '../store'

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  if (wholeSeconds < 60) return `${wholeSeconds}s`
  if (wholeSeconds < 3600) {
    const minutes = Math.floor(wholeSeconds / 60)
    const secs = wholeSeconds % 60
    return `${minutes}m${secs}s`
  }
  const h = Math.floor(wholeSeconds / 3600)
  const m = Math.floor((wholeSeconds % 3600) / 60)
  const s = wholeSeconds % 60
  return `${h}h${m}m${s}s`
}

const durationFlowClass =
  'inline-flex flex-wrap items-baseline font-mono font-bold tabular-nums tracking-tight text-[2.125rem] leading-none sm:text-[2.5rem]'

function TotalDurationFlow({ seconds }: { seconds: number }) {
  const s = Math.max(0, Math.floor(seconds))

  if (s < 60) {
    return (
      <span className={durationFlowClass}>
        <NumberFlow locales="en-US" suffix="s" value={s} />
      </span>
    )
  }

  if (s < 3600) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return (
      <NumberFlowGroup>
        <span className={durationFlowClass}>
          <NumberFlow locales="en-US" suffix="m" value={m} />
          <NumberFlow locales="en-US" suffix="s" value={sec} />
        </span>
      </NumberFlowGroup>
    )
  }

  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return (
    <NumberFlowGroup>
      <span className={durationFlowClass}>
        <NumberFlow locales="en-US" suffix="h" value={h} />
        <NumberFlow locales="en-US" suffix="m" value={m} />
        <NumberFlow locales="en-US" suffix="s" value={sec} />
      </span>
    </NumberFlowGroup>
  )
}

function ProjectBar({
  name,
  total,
  agents,
  maxTotal,
}: {
  name: string
  total: number
  agents: Array<{ agent: string; total: number }>
  maxTotal: number
}) {
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0

  return (
    <div className="flex flex-col gap-2 border-border/45 border-b py-2.5 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex items-center justify-between gap-4">
        <span className="truncate text-[13px] font-medium leading-snug">{name}</span>
        <span className="shrink-0 font-mono text-[13px] text-muted-foreground tabular-nums leading-snug">
          {formatDuration(total)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      {agents.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {agents.map(({ agent, total: agentTotal }) => (
            <span key={agent} className="text-[11px] text-muted-foreground leading-snug">
              {agent}: {formatDuration(agentTotal)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Today() {
  const { data: summary, error, isLoading } = useIpcQuery('getTodaySummary', todaySummaryAtom)
  const { data: openTurns } = useIpcQuery('getOpenTurns', openTurnsAtom)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (!openTurns || openTurns.length === 0) return

    const timer = window.setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [openTurns])

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!summary) {
    return (
      <PageShell className="py-7 sm:py-8">
        <header className="space-y-1">
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">Today</h1>
          <p className="text-[13px] text-muted-foreground leading-snug">
            {error ?? 'Unable to load today summary.'}
          </p>
        </header>
      </PageShell>
    )
  }

  const liveProjectMap = new Map(
    summary.projects.map((project) => [
      project.name,
      {
        total: project.total,
        agents: new Map(project.agents.map((agent) => [agent.agent, agent.total])),
      },
    ]),
  )

  for (const turn of openTurns ?? []) {
    const elapsed = Math.max(0, nowSec - Math.floor(turn.started_at))
    const entry = liveProjectMap.get(turn.project) ?? { total: 0, agents: new Map<string, number>() }
    entry.total += elapsed
    entry.agents.set(turn.agent, (entry.agents.get(turn.agent) ?? 0) + elapsed)
    liveProjectMap.set(turn.project, entry)
  }

  const projects = [...liveProjectMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => ({
      name,
      total: data.total,
      agents: [...data.agents.entries()]
        .filter(([, total]) => total > 0)
        .map(([agent, total]) => ({ agent, total })),
    }))

  const grandTotal = projects.reduce((sum, project) => sum + project.total, 0)
  const turnCount = summary.turnCount
  const activeProjectCount = projects.length
  const { date } = summary
  const maxTotal = projects.length > 0 ? Math.max(...projects.map((p) => p.total)) : 0

  const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (projects.length === 0) {
    return (
      <PageShell className="py-7 sm:py-8">
        <header className="space-y-1">
          <p className="text-[13px] text-muted-foreground leading-snug">{displayDate}</p>
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">Today</h1>
        </header>
        <p className="mt-5 text-[13px] text-muted-foreground leading-relaxed">
          No activity today. Start coding to see your time breakdown.
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex flex-col gap-8 py-7 sm:px-7 sm:py-8">
      <div className="flex flex-col gap-6">
        <header className="space-y-1">
          <p className="text-[13px] text-muted-foreground leading-snug">{displayDate}</p>
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">Today</h1>
        </header>

        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-10 sm:gap-y-2">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground leading-snug">Total coding time</p>
            <div className="mt-1 leading-none">
              <TotalDurationFlow seconds={grandTotal} />
            </div>
          </div>
          <p className="max-w-[16rem] text-[13px] text-muted-foreground leading-snug sm:shrink-0 sm:text-right">
            {turnCount} turn{turnCount !== 1 ? 's' : ''} across {activeProjectCount} project
            {activeProjectCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <section className="min-w-0">
        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle>By project</CardTitle>
            <CardDescription>Breakdown for today</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 pt-0">
            {projects.map(({ name, total, agents }) => (
              <ProjectBar
                key={name}
                name={name}
                total={total}
                agents={agents}
                maxTotal={maxTotal}
              />
            ))}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  )
}
