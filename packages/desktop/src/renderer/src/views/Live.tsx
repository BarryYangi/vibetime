import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { Spinner } from '@/components/ui/spinner'
import type { ActiveTurn, TodayLiveState } from '../../../shared/ipc-types'
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
      <div className="flex min-h-[5.5rem] items-baseline overflow-hidden font-mono font-bold tabular-nums text-[4.5rem] leading-none lg:text-[6rem]">
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
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="relative isolate flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card p-6"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <motion.div
        aria-hidden
        animate={{ opacity: [0.16, 0.34, 0.16], scale: [1, 1.06, 1] }}
        className="absolute right-6 top-6 size-3 rounded-full bg-success"
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        animate={{ x: ['-45%', '145%'] }}
        className="absolute bottom-0 left-0 h-1 w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent opacity-70"
        transition={{ duration: 3.6, repeat: Infinity, ease: 'linear' }}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground leading-snug">{turn.agent}</p>
          <h1
            className={
              compact
                ? 'mt-1 truncate font-heading text-[2.55rem] font-bold leading-none'
                : 'mt-2 truncate font-heading text-[4.5rem] font-bold leading-none'
            }
          >
            {turn.project}
          </h1>
        </div>
        <LiveTimer seconds={elapsed} />
        <footer className="flex items-center justify-between gap-4 border-border/60 border-t pt-4 text-[13px] text-muted-foreground">
          <span>Today in project</span>
          <span className="font-mono tabular-nums">{formatCompactDuration(total)}</span>
        </footer>
      </div>
    </motion.section>
  )
}

export default function Live() {
  const { data: liveState, error, isLoading } = useIpcQuery(
    'getTodayLiveState',
    todayLiveStateAtom,
    setTodayLiveState,
  )
  const [now, setNow] = useState(() => Date.now() / 1000)
  const activeTurnCount = liveState?.activeTurns.length ?? 0

  useEffect(() => {
    if (!liveState) return
    setNow(Math.max(Date.now() / 1000, liveState.serverNow))
  }, [liveState])

  useEffect(() => {
    if (activeTurnCount === 0) return
    const timer = window.setInterval(() => setNow(Date.now() / 1000), TICK_MS)
    return () => window.clearInterval(timer)
  }, [activeTurnCount])

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
        <motion.div
          animate={{ opacity: [0.82, 1, 0.82] }}
          className="relative isolate flex w-full max-w-3xl flex-col items-center overflow-hidden rounded-lg border border-border bg-card px-8 py-16 text-center"
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.div
            aria-hidden
            animate={{ x: ['-60%', '160%'] }}
            className="absolute bottom-0 h-px w-2/3 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          />
          <h1 className="font-heading text-[3.5rem] font-bold leading-none">No active turn</h1>
          <p className="mt-4 max-w-md text-[14px] text-muted-foreground leading-relaxed">
            Start a coding-agent turn and it will appear here.
          </p>
        </motion.div>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-4 p-5" fluid>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-muted-foreground">Active now</p>
          <h1 className="font-heading text-2xl font-semibold">Live</h1>
        </div>
        <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
          {turns.length} running
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
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
