import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { useEffect, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { Spinner } from '@/components/ui/spinner'
import type { ActiveTurn } from '../../../shared/ipc-types'
import { useDocumentVisible } from '../hooks/useDocumentVisible'
import { useIpcQuery } from '../hooks/useIpcQuery'
import { refreshTodayLiveState, setTodayLiveState, todayLiveStateAtom } from '../store'

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
  'inline-flex h-[2.75rem] min-w-[12rem] max-w-full items-baseline overflow-hidden font-mono font-bold tabular-nums text-[2.125rem] leading-none sm:h-[3.125rem] sm:min-w-[14rem] sm:text-[2.5rem]'
const durationUnitClass =
  'ml-[0.08em] mr-[0.16em] text-[0.56em] font-semibold text-muted-foreground/80'
const ACTIVE_REFRESH_INTERVAL_MS = 1000

function DurationSegment({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="inline-flex items-baseline">
      <NumberFlow locales="en-US" value={value} />
      <span className={durationUnitClass}>{unit}</span>
    </span>
  )
}

function TotalDurationFlow({ seconds }: { seconds: number }) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60

  return (
    <NumberFlowGroup>
      <span className={durationFlowClass}>
        <span className="inline-flex items-baseline">
          {h > 0 && <DurationSegment unit="h" value={h} />}
          {(h > 0 || m > 0) && <DurationSegment unit="m" value={m} />}
          <DurationSegment unit="s" value={sec} />
        </span>
      </span>
    </NumberFlowGroup>
  )
}

function activeSeconds(turn: ActiveTurn, now: number, dayStart: number): number {
  return Math.max(0, now - Math.max(turn.started_at, dayStart))
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground leading-snug">{label}</dt>
      <dd className="mt-1 flex h-6 items-baseline font-mono font-semibold text-[15px] tabular-nums leading-none">
        <span className="inline-flex min-w-[2ch]">
          <NumberFlow locales="en-US" value={value} />
        </span>
      </dd>
    </div>
  )
}

function ProjectBar({
  name,
  completed,
  active,
  agents,
  maxTotal,
}: {
  name: string
  completed: number
  active: number
  agents: Array<{ agent: string; completed: number; active: number }>
  maxTotal: number
}) {
  const total = completed + active
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0

  return (
    <div className="flex flex-col gap-2.5 border-border/45 border-b py-3 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-6">
        <span className="truncate text-[13px] font-medium leading-snug">{name}</span>
        <span className="min-w-[6.75rem] shrink-0 text-right font-mono text-[13px] text-muted-foreground tabular-nums leading-snug">
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {agents.map(({ agent, completed: agentCompleted, active: agentActive }) => (
            <span key={agent} className="min-w-0 text-[11px] text-muted-foreground leading-snug">
              <span>{agent}</span>
              <span className="mx-1.5 text-muted-foreground/60">·</span>
              <span className="font-mono tabular-nums">
                {formatDuration(agentCompleted + agentActive)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Today() {
  const {
    data: liveState,
    error,
    isLoading,
  } = useIpcQuery('getTodayLiveState', todayLiveStateAtom, setTodayLiveState)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const activeTurnCount = liveState?.activeTurns.length ?? 0
  const documentVisible = useDocumentVisible()

  useEffect(() => {
    if (!liveState) return
    setNow(Math.max(Date.now() / 1000, liveState.serverNow))
  }, [liveState])

  useEffect(() => {
    if (activeTurnCount === 0 || !documentVisible) return

    const tick = () => {
      const nextNow = Date.now() / 1000
      setNow(nextNow)

      if (liveState) {
        const currentDayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
        if (currentDayStart !== liveState.dayStart) {
          void refreshTodayLiveState()
        }
      }
    }
    tick()

    const timer = window.setInterval(tick, ACTIVE_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [activeTurnCount, documentVisible, liveState])

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!liveState) {
    return (
      <PageShell className="py-7 sm:py-8" fluid>
        <header className="space-y-1">
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">Today</h1>
          <p className="text-[13px] text-muted-foreground leading-snug">
            {error ?? 'Unable to load today summary.'}
          </p>
        </header>
      </PageShell>
    )
  }

  const { completed, activeTurns, dayStart } = liveState
  const { activeTotal, projects } = (() => {
    let nextActiveTotal = 0
    const completedOrder = new Map(
      completed.projects.map((project, index) => [project.name, index] as const),
    )
    const projectMap = new Map<
      string,
      {
        completed: number
        active: number
        agents: Map<string, { completed: number; active: number }>
      }
    >()

    for (const project of completed.projects) {
      projectMap.set(project.name, {
        completed: project.total,
        active: 0,
        agents: new Map(
          project.agents.map((agent) => [agent.agent, { completed: agent.total, active: 0 }]),
        ),
      })
    }

    for (const turn of activeTurns) {
      const active = activeSeconds(turn, now, dayStart)
      if (active <= 0) continue

      nextActiveTotal += active

      const project = projectMap.get(turn.project) ?? {
        completed: 0,
        active: 0,
        agents: new Map<string, { completed: number; active: number }>(),
      }
      project.active += active

      const agent = project.agents.get(turn.agent) ?? { completed: 0, active: 0 }
      agent.active += active
      project.agents.set(turn.agent, agent)
      projectMap.set(turn.project, project)
    }

    const nextProjects = [...projectMap.entries()]
      .map(([name, project]) => ({
        name,
        completed: project.completed,
        active: project.active,
        agents: [...project.agents.entries()]
          .map(([agent, totals]) => ({ agent, ...totals }))
          .filter((agent) => agent.completed + agent.active > 0),
      }))
      .sort((a, b) => {
        const aOrder = completedOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER
        const bOrder = completedOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.name.localeCompare(b.name)
      })

    return { activeTotal: nextActiveTotal, projects: nextProjects }
  })()
  const liveTotal = completed.grandTotal + activeTotal
  const turnCount = completed.turnCount
  const activeProjectCount = projects.length
  const { date } = completed
  const maxTotal =
    projects.length > 0 ? Math.max(...projects.map((p) => p.completed + p.active)) : 0

  const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (projects.length === 0) {
    return (
      <PageShell className="py-7 sm:py-8" fluid>
        <header className="space-y-1">
          <p className="text-[13px] text-muted-foreground leading-snug">{displayDate}</p>
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">Today</h1>
        </header>
        <p className="mt-5 text-[13px] text-muted-foreground leading-relaxed">No activity today.</p>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex flex-col gap-8 py-7 sm:px-7 sm:py-8" fluid>
      <div className="flex flex-col gap-6">
        <header className="space-y-1">
          <p className="text-[13px] text-muted-foreground leading-snug">{displayDate}</p>
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">Today</h1>
        </header>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground leading-snug">Total agent time</p>
            <div className="mt-1 leading-none">
              <TotalDurationFlow seconds={liveTotal} />
            </div>
          </div>
          <dl className="grid w-full grid-cols-3 gap-8 pb-1 sm:w-[21rem]">
            <SummaryStat label="Turns" value={turnCount} />
            <SummaryStat label="Projects" value={activeProjectCount} />
            <SummaryStat label="Running" value={activeTurns.length} />
          </dl>
        </div>
      </div>

      <section className="min-w-0 mt-2">
        <header className="mb-2.5 px-1">
          <h2 className="text-[14px] font-semibold tracking-tight text-foreground">By project</h2>
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">Breakdown for today</p>
        </header>
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-sm shadow-black/[0.01]">
          <div className="flex flex-col gap-0 px-5 pt-3 pb-5">
            {projects.map(({ name, completed: projectCompleted, active, agents }) => (
              <ProjectBar
                key={name}
                name={name}
                completed={projectCompleted}
                active={active}
                agents={agents}
                maxTotal={maxTotal}
              />
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  )
}
