import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { ActivityIcon, ClockIcon, FolderIcon, TimerIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { Spinner } from '@/components/ui/spinner'
import { durationParts, durationUnit, formatClockTime, formatDurationFull } from '@/lib/format'
import type { ActiveTurn, TodayLiveState } from '../../../shared/ipc-types'
import { useDocumentVisible } from '../hooks/useDocumentVisible'
import { useIpcQuery } from '../hooks/useIpcQuery'
import { useI18n } from '../i18n'
import { setTodayLiveState, todayLiveStateAtom } from '../store'

type TFunction = ReturnType<typeof useI18n>['t']
const TICK_MS = 1000

function formatStableId(id: string): string {
  const uuid = id.match(/^([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-([0-9a-f]{12})$/i)
  if (uuid?.[1] && uuid[2]) {
    return `${uuid[1]}...${uuid[2].slice(-4)}`
  }

  if (id.length <= 16) return id
  return `${id.slice(0, 8)}...${id.slice(-4)}`
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

function LiveTimer({ seconds, locale }: { seconds: number; locale: string }) {
  const { h, m, s } = durationParts(seconds)

  return (
    <NumberFlowGroup>
      <div className="live-duration-flow flex min-h-[4.75rem] items-baseline overflow-hidden font-heading tracking-tight font-bold tabular-nums text-[3.75rem] leading-none lg:text-[5rem]">
        {h > 0 && (
          <NumberFlow
            className="duration-number-flow"
            locales={locale}
            suffix={durationUnit('h', locale)}
            value={h}
            willChange
          />
        )}
        {(h > 0 || m > 0) && (
          <NumberFlow
            className="duration-number-flow"
            locales={locale}
            suffix={durationUnit('m', locale)}
            value={m}
            willChange
          />
        )}
        <NumberFlow
          className="duration-number-flow"
          locales={locale}
          suffix={durationUnit('s', locale)}
          value={s}
          willChange
        />
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
    <div className="flex min-w-0 items-center gap-3 py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-muted-foreground leading-none">{label}</p>
        <p className="mt-1 truncate font-heading tracking-tight text-[14px] font-medium leading-none tabular-nums text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

function TurnStage({
  turn,
  state,
  now,
  compact,
  locale,
  t,
}: {
  turn: ActiveTurn
  state: TodayLiveState
  now: number
  compact: boolean
  locale: string
  t: TFunction
}) {
  const elapsed = activeSeconds(turn, state, now)
  const total = projectTotal(turn.project, state, now)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="relative isolate overflow-hidden rounded-[18px] border border-border/40 bg-card/40 shadow-sm shadow-black/[0.01]">
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
            <div className="mt-1 flex items-center gap-1.5 px-2">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              <span className="text-[11px] font-medium tracking-wide text-success uppercase">
                {t('live.liveBadge')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-5 px-5 pt-0 pb-5">
          <LiveTimer locale={locale} seconds={elapsed} />
          <div className="grid gap-2 md:grid-cols-3">
            <Metric
              icon={ClockIcon}
              label={t('live.started')}
              value={formatClockTime(turn.started_at, locale)}
            />
            <Metric
              icon={TimerIcon}
              label={t('live.projectToday')}
              value={formatDurationFull(total, locale)}
            />
            <Metric
              icon={FolderIcon}
              label={t('live.session')}
              value={formatStableId(turn.session_id)}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Live() {
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
        <p className="text-[13px] text-muted-foreground">{error ?? t('live.unable')}</p>
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
            {t('live.noActiveTurn')}
          </h1>
          <p className="mt-3 max-w-sm text-[13px] text-muted-foreground leading-relaxed">
            {t('live.noActiveTurnDescription')}
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-5 p-5" fluid>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-muted-foreground">{t('live.activeNow')}</p>
          <h1 className="font-heading text-2xl font-semibold">{t('live.title')}</h1>
        </div>
        <span className="font-heading tracking-tight text-[13px] text-muted-foreground tabular-nums">
          {turns.length} {t('live.running')}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-4">
        {turns.map((turn) => (
          <TurnStage
            key={turn.turn_id}
            compact={turns.length > 1}
            locale={locale}
            now={now}
            state={liveState}
            t={t}
            turn={turn}
          />
        ))}
      </div>
    </PageShell>
  )
}
