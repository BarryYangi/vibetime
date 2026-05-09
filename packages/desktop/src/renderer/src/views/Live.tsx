import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { ActivityIcon, ClockIcon, FolderIcon, TimerIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { Spinner } from '@/components/ui/spinner'
import type { ActiveTurn, TodayLiveState } from '../../../shared/ipc-types'
import { useDocumentVisible } from '../hooks/useDocumentVisible'
import { useIpcQuery } from '../hooks/useIpcQuery'
import { setTodayLiveState, todayLiveStateAtom } from '../store'

const TICK_MS = 1000

function formatDurationParts(seconds: number): { h: number; m: number; s: number } {
  const whole = Math.max(0, Math.floor(seconds))
  return {
    h: Math.floor(whole / 3600),
    m: Math.floor((whole % 3600) / 60),
    s: whole % 60,
  }
}

function formatCompactDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  if (whole < 3600) return `${Math.floor(whole / 60)}m ${whole % 60}s`
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  return `${h}h ${m}m`
}

function formatClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function activeSeconds(turn: ActiveTurn, state: TodayLiveState, now: number): number {
  return Math.max(0, now - Math.max(turn.started_at, state.dayStart))
}

function projectTotal(project: string, state: TodayLiveState, now: number): number {
  const completed = state.completed.projects.find((item) => item.name === project)?.total ?? 0
  const active = state.activeTurns
    .filter((turn) => turn.project === project)
    .reduce((sum, turn) => sum + activeSeconds(turn, state, now), 0)
  return completed + active
}

function LiveTimer({ seconds }: { seconds: number }) {
  const { h, m, s } = formatDurationParts(seconds)

  return (
    <NumberFlowGroup>
      <div className="flex min-h-[4.75rem] items-baseline overflow-hidden font-mono font-bold tabular-nums text-[3.75rem] leading-none lg:text-[5rem]">
        {h > 0 && (
          <span className="inline-flex items-baseline">
            <NumberFlow locales="en-US" value={h} />
            <span className="mx-1 text-[0.38em] text-muted-foreground">h</span>
          </span>
        )}
        {(h > 0 || m > 0) && (
          <span className="inline-flex items-baseline">
            <NumberFlow locales="en-US" value={m} />
            <span className="mx-1 text-[0.38em] text-muted-foreground">m</span>
          </span>
        )}
        <span className="inline-flex items-baseline">
          <NumberFlow locales="en-US" value={s} />
          <span className="ml-1 text-[0.38em] text-muted-foreground">s</span>
        </span>
      </div>
    </NumberFlowGroup>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClockIcon
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-[13px] tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function TurnStage({
  turn,
  state,
  now,
  compact,
}: {
  turn: ActiveTurn
  state: TodayLiveState
  now: number
  compact: boolean
}) {
  const elapsed = activeSeconds(turn, state, now)
  const total = projectTotal(turn.project, state, now)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="relative isolate overflow-hidden rounded-xl border border-border/55 bg-card shadow-sm shadow-black/[0.02]">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-success/70" />
        <div className="px-5 pt-5 pb-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-medium leading-none text-muted-foreground">
                {turn.agent}
              </p>
              <h2
                className={
                  compact
                    ? 'mt-1.5 truncate font-heading text-2xl font-semibold leading-none text-foreground'
                    : 'mt-1.5 truncate font-heading text-[2rem] font-semibold leading-none text-foreground'
                }
              >
                {turn.project}
              </h2>
            </div>
            <span className="mt-0 rounded-full border border-success/35 bg-success/10 px-2.5 py-1 text-[11px] font-medium leading-none text-success">
              Live
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-5 px-5 pt-0 pb-5">
          <LiveTimer seconds={elapsed} />
          <div className="grid gap-2 md:grid-cols-3">
            <Metric icon={ClockIcon} label="Started" value={formatClock(turn.started_at)} />
            <Metric icon={TimerIcon} label="Project today" value={formatCompactDuration(total)} />
            <Metric icon={FolderIcon} label="Session" value={turn.session_id.slice(0, 12)} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Live() {
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
    const tick = () => setNow(Date.now() / 1000)
    tick()
    const timer = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(timer)
  }, [activeTurnCount, documentVisible])

  const turns = useMemo(() => liveState?.activeTurns ?? [], [liveState])

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!liveState) {
    return (
      <PageShell className="py-8" fluid>
        <p className="text-[13px] text-muted-foreground">
          {error ?? 'Unable to load data. Try reopening VibeTime.'}
        </p>
      </PageShell>
    )
  }

  if (turns.length === 0) {
    return (
      <PageShell className="flex h-full min-h-[calc(100vh-2rem)] items-center justify-center" fluid>
        <div className="flex w-full max-w-xl flex-col items-center px-8 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40 shadow-sm shadow-black/[0.02]">
            <ActivityIcon aria-hidden className="size-5 text-muted-foreground" />
          </div>
          <h1 className="mt-5 font-heading text-3xl font-semibold leading-none text-foreground">
            No active turn
          </h1>
          <p className="mt-3 max-w-sm text-[13px] text-muted-foreground leading-relaxed">
            Start a coding-agent turn and it will appear here.
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-5 p-5" fluid>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-muted-foreground">Active now</p>
          <h1 className="font-heading text-2xl font-semibold">Live</h1>
        </div>
        <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
          {turns.length} running
        </span>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-4">
        {turns.map((turn) => (
          <TurnStage
            key={turn.turn_id}
            compact={turns.length > 1}
            now={now}
            state={liveState}
            turn={turn}
          />
        ))}
      </div>
    </PageShell>
  )
}
