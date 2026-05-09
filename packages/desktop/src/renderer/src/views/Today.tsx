import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { useEffect, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { getAgentTheme, StackedProgress } from '@/components/StackedProgress'
import { Spinner } from '@/components/ui/spinner'
import { durationParts, durationUnit, formatDurationFull } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ActiveTurn } from '../../../shared/ipc-types'
import { useDocumentVisible } from '../hooks/useDocumentVisible'
import { useIpcQuery } from '../hooks/useIpcQuery'
import { useI18n } from '../i18n'
import { refreshTodayLiveState, setTodayLiveState, todayLiveStateAtom } from '../store'

type TFunction = ReturnType<typeof useI18n>['t']

const durationFlowClass =
  'inline-flex max-w-full items-baseline overflow-hidden font-heading font-semibold tabular-nums leading-none tracking-tight'
const ACTIVE_REFRESH_INTERVAL_MS = 1000

function DurationSegment({
  value,
  unit,
  locale,
}: {
  value: number
  unit: 'h' | 'm' | 's'
  locale: string
}) {
  return (
    <NumberFlow
      className="duration-number-flow"
      locales={locale}
      suffix={durationUnit(unit, locale)}
      value={value}
      willChange
    />
  )
}

function TotalDurationFlow({ seconds, locale }: { seconds: number; locale: string }) {
  const { h, m, s } = durationParts(seconds)

  return (
    <NumberFlowGroup>
      <span className={durationFlowClass}>
        {h > 0 && <DurationSegment locale={locale} unit="h" value={h} />}
        {(h > 0 || m > 0) && <DurationSegment locale={locale} unit="m" value={m} />}
        <DurationSegment locale={locale} unit="s" value={s} />
      </span>
    </NumberFlowGroup>
  )
}

function activeSeconds(turn: ActiveTurn, now: number, dayStart: number): number {
  return Math.max(0, now - Math.max(turn.started_at, dayStart))
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%'
  if (value < 0.01) return '<1%'
  return `${Math.round(value * 100)}%`
}

function ProjectBar({
  name,
  completed,
  active,
  agents,
  todayTotal,
  locale,
  t,
}: {
  name: string
  completed: number
  active: number
  agents: Array<{ agent: string; completed: number; active: number }>
  todayTotal: number
  locale: string
  t: TFunction
}) {
  const total = completed + active
  const share = todayTotal > 0 ? total / todayTotal : 0

  const segments = agents.map((a, i) => {
    const theme = getAgentTheme(a.agent, i)
    const agentTotal = a.completed + a.active
    const agentPct = total > 0 ? (agentTotal / total) * 100 : 0
    return {
      id: a.agent,
      label: a.agent,
      value: agentTotal,
      colorClass: theme.bg,
      tooltip: `${a.agent}: ${formatDurationFull(agentTotal, locale)} (${Math.round(agentPct)}% ${t('today.ofProject')})`,
    }
  })

  return (
    <div className="flex flex-col gap-3 border-border/40 border-b py-5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-6 px-1">
        <span className="truncate text-[13px] font-semibold tracking-tight text-foreground/90">
          {name}
        </span>
        <div className="flex shrink-0 items-baseline gap-2 text-right">
          <span className="font-heading text-[13px] font-medium text-foreground/80 tabular-nums tracking-tight">
            {formatDurationFull(total, locale)}
          </span>
          <span className="min-w-9 font-heading text-[11px] text-muted-foreground/50 tabular-nums tracking-tight">
            {formatPercent(share)}
          </span>
        </div>
      </div>

      <div className="px-1">
        <StackedProgress segments={segments} total={todayTotal} />
      </div>

      {agents.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1">
          {agents.map(({ agent, completed: agentCompleted, active: agentActive }, index) => {
            const theme = getAgentTheme(agent, index)
            return (
              <span key={agent} className="min-w-0 text-[11px] leading-snug">
                <span className={cn('font-medium transition-colors', theme.text)}>{agent}</span>
                <span className="mx-1.5 text-muted-foreground/75">·</span>
                <span className="font-heading text-muted-foreground/70 tabular-nums tracking-tight">
                  {formatDurationFull(agentCompleted + agentActive, locale)}
                </span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-[18px] border border-border/40 bg-card/40 pt-5 px-5 pb-3 shadow-sm shadow-black/[0.01]">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <div className="font-heading text-[26px] font-semibold tracking-tight text-foreground">
          {value}
        </div>
      </div>
    </div>
  )
}

export default function Today() {
  const { locale, t } = useI18n()
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
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">
            {t('today.title')}
          </h1>
          <p className="text-[13px] text-muted-foreground leading-snug">
            {error ?? t('today.unable')}
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
          .filter((agent) => agent.completed + agent.active > 0)
          .sort(
            (a, b) =>
              b.completed + b.active - (a.completed + a.active) || a.agent.localeCompare(b.agent),
          ),
      }))
      .sort((a, b) => {
        const totalDiff = b.completed + b.active - (a.completed + a.active)
        if (totalDiff !== 0) return totalDiff
        const aOrder = completedOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER
        const bOrder = completedOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER
        return aOrder - bOrder || a.name.localeCompare(b.name)
      })

    return { activeTotal: nextActiveTotal, projects: nextProjects }
  })()
  const liveTotal = completed.grandTotal + activeTotal
  const turnCount = completed.turnCount
  const activeProjectCount = projects.length
  const { date } = completed

  const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (projects.length === 0) {
    return (
      <PageShell className="py-7 sm:py-8" fluid>
        <header className="space-y-1">
          <p className="text-[13px] text-muted-foreground leading-snug">{displayDate}</p>
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">
            {t('today.title')}
          </h1>
        </header>
        <p className="mt-5 text-[13px] text-muted-foreground leading-relaxed">
          {t('today.noActivity')}
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex flex-col gap-8 py-7 sm:px-7 sm:py-8" fluid>
      <header className="space-y-1">
        <p className="text-[13px] text-muted-foreground leading-snug">{displayDate}</p>
        <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em]">
          {t('today.title')}
        </h1>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('today.totalAgentTime')}
          value={<TotalDurationFlow locale={locale} seconds={liveTotal} />}
        />
        <StatTile
          label={t('today.turns')}
          value={<NumberFlow locales={locale} value={turnCount} />}
        />
        <StatTile
          label={t('today.projects')}
          value={<NumberFlow locales={locale} value={activeProjectCount} />}
        />
        <StatTile
          label={t('today.running')}
          value={<NumberFlow locales={locale} value={activeTurns.length} />}
        />
      </section>

      <section className="min-w-0 mt-2">
        <header className="mb-2.5 px-1">
          <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
            {t('today.byProject')}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
            {t('today.breakdown')}
          </p>
        </header>
        <div className="overflow-hidden rounded-[18px] border border-border/40 bg-card/40 shadow-sm shadow-black/[0.01]">
          <div className="flex flex-col gap-0 px-5 py-2">
            {projects.map(({ name, completed: projectCompleted, active, agents }) => (
              <ProjectBar
                key={name}
                name={name}
                completed={projectCompleted}
                active={active}
                agents={agents}
                todayTotal={liveTotal}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  )
}
