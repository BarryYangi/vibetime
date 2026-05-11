import { allocateDurationByLocalDay, durationWithinWindow, resolveTurnInterval } from './time.js'

export const HISTORY_PERIODS = [7, 30, 90, 365] as const
export const HISTORY_TURN_START_BUFFER_SEC = 86400

export type HistoryPeriodDays = (typeof HISTORY_PERIODS)[number]

export interface HistoryEvent {
  agent: string
  event_type: string
  project: string
  session_id: string
  turn_id?: string | null
  ts: number
  timezone: string
  duration_sec?: number | null
  meta?: Record<string, unknown> | string | null
}

export interface HistoryCalendarDay {
  date: string
  total: number
}

export interface HistoryTrendDay {
  date: string
  projects: Record<string, number>
}

export interface HistoryTopProjectRow {
  project: string
  total: number
  turns: number
  lastActive: number | null
}

export interface HistoryHourlyCell {
  weekday: number
  hour: number
  total: number
}

export interface HistoryTurnDuration {
  project: string
  agent: string
  turnId: string | null
  startedAt: number
  endedAt: number
  duration: number
}

export interface HistoryProjectAgentTotal {
  project: string
  total: number
  agents: Array<{ agent: string; total: number; turns: number }>
}

export interface HistoryPeriodCompare {
  currentTotal: number
  previousTotal: number
  delta: number
  deltaRatio: number | null
}

export interface HistorySummary {
  periodDays: HistoryPeriodDays
  calendar: HistoryCalendarDay[]
  trendProjects: string[]
  trends: HistoryTrendDay[]
  topProjects: HistoryTopProjectRow[]
  hourlyMatrix: HistoryHourlyCell[]
  turnDurations: HistoryTurnDuration[]
  projectAgentTotals: HistoryProjectAgentTotal[]
  periodCompare: HistoryPeriodCompare
}

export function isHistoryPeriodDays(value: number): value is HistoryPeriodDays {
  return (HISTORY_PERIODS as readonly number[]).includes(value)
}

export function historyLowerBound(rangeEnd: number, periodDays: HistoryPeriodDays): number {
  const calendarStart = rangeEnd - 365 * 86400
  const previousPeriodStart = rangeEnd - 2 * periodDays * 86400
  return Math.min(calendarStart, previousPeriodStart)
}

function parseEventMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta) return null
  if (typeof meta === 'object' && !Array.isArray(meta)) return meta as Record<string, unknown>
  if (typeof meta !== 'string') return null
  try {
    const parsed = JSON.parse(meta)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isUnknownDurationEnd(ev: HistoryEvent): boolean {
  const meta = parseEventMeta(ev.meta)
  return meta?.abandoned === true || meta?.reason === 'stale_sweep'
}

function startOfLocalDay(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

function startOfLocalHour(date: Date): number {
  return Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime() / 1000,
  )
}

function toDateKey(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-CA')
}

function weekdayIndex(ts: number): number {
  const day = new Date(ts * 1000).getDay()
  return day === 0 ? 6 : day - 1
}

function denseDateKeys(days: number, endDate: Date): string[] {
  const endDay = startOfLocalDay(endDate)
  const firstDay = endDay - (days - 1) * 86400
  return Array.from({ length: days }, (_, index) => toDateKey(firstDay + index * 86400))
}

function buildTurnStarts(events: HistoryEvent[]): Map<string, { ts: number }> {
  const turnStarts = new Map<string, { ts: number }>()
  for (const ev of events) {
    if (ev.event_type === 'turn_start' && ev.turn_id) {
      const existingStart = turnStarts.get(ev.turn_id)
      if (!existingStart || ev.ts < existingStart.ts) {
        turnStarts.set(ev.turn_id, { ts: ev.ts })
      }
    }
  }
  return turnStarts
}

function completedTurnEventsInWindow(
  events: HistoryEvent[],
  from: number,
  to: number,
): HistoryEvent[] {
  return events.filter((ev) => ev.event_type === 'turn_end' && ev.ts >= from && ev.ts < to)
}

function completedDuration(
  ev: HistoryEvent,
  turnStarts: Map<string, { ts: number }>,
  windowStart: number,
  windowEnd: number,
): number | null {
  if (isUnknownDurationEnd(ev)) return null

  const start = ev.turn_id ? turnStarts.get(ev.turn_id) : undefined
  return durationWithinWindow({
    endTs: ev.ts,
    durationSec: ev.duration_sec,
    startTs: start?.ts,
    windowStart,
    windowEnd,
  })
}

function allocateDurationByLocalHour(input: {
  endTs: number
  durationSec?: number | null | undefined
  startTs?: number | undefined
  rangeStart: number
  rangeEnd: number
}): Array<{ hourStart: number; duration: number }> {
  const interval = resolveTurnInterval(input)
  if (!interval) return []

  const start = Math.max(interval.start, input.rangeStart)
  const end = Math.min(interval.end, input.rangeEnd)
  if (end <= start) return []

  const allocations: Array<{ hourStart: number; duration: number }> = []
  let cursor = start

  while (cursor < end) {
    const hourStart = startOfLocalHour(new Date(cursor * 1000))
    const nextHour = hourStart + 3600
    const segmentEnd = Math.min(end, nextHour)
    allocations.push({ hourStart, duration: segmentEnd - cursor })
    cursor = segmentEnd
  }

  return allocations
}

export function buildHistorySummaryFromEvents(
  events: HistoryEvent[],
  options: { periodDays: HistoryPeriodDays; now?: Date },
): HistorySummary {
  const now = options.now ?? new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const rangeEnd = startOfLocalDay(tomorrow)
  const calendarStart = rangeEnd - 365 * 86400
  const periodStart = rangeEnd - options.periodDays * 86400
  const turnStarts = buildTurnStarts(events)
  const calendarTotals = new Map(denseDateKeys(365, now).map((date) => [date, 0]))
  const periodProjectTotals = new Map<string, number>()
  const trendProjectDayTotals = new Map<string, Map<string, number>>()
  const hourlyTotals = new Map<string, number>()
  const projectAgentTotals = new Map<
    string,
    { project: string; total: number; agents: Map<string, { total: number; turns: Set<string> }> }
  >()
  const turnDurations: HistoryTurnDuration[] = []
  const topProjectRows = new Map<
    string,
    { project: string; total: number; turns: Set<string>; lastActive: number | null }
  >()
  let currentPeriodTotal = 0
  let previousPeriodTotal = 0
  const previousPeriodStart = periodStart - options.periodDays * 86400

  for (const ev of completedTurnEventsInWindow(events, calendarStart, rangeEnd)) {
    if (isUnknownDurationEnd(ev)) continue

    const allocations = allocateDurationByLocalDay({
      endTs: ev.ts,
      durationSec: ev.duration_sec,
      startTs: ev.turn_id ? turnStarts.get(ev.turn_id)?.ts : undefined,
      rangeStart: calendarStart,
      rangeEnd,
    })

    for (const allocation of allocations) {
      calendarTotals.set(
        allocation.day,
        (calendarTotals.get(allocation.day) ?? 0) + allocation.duration,
      )
    }

    const periodDuration = completedDuration(ev, turnStarts, periodStart, rangeEnd)
    if (periodDuration === null || periodDuration <= 0) continue

    currentPeriodTotal += periodDuration
    periodProjectTotals.set(ev.project, (periodProjectTotals.get(ev.project) ?? 0) + periodDuration)

    let row = topProjectRows.get(ev.project)
    if (!row) {
      row = { project: ev.project, total: 0, turns: new Set(), lastActive: null }
      topProjectRows.set(ev.project, row)
    }
    row.total += periodDuration
    if (ev.turn_id) row.turns.add(ev.turn_id)
    row.lastActive = Math.max(row.lastActive ?? 0, ev.ts)

    let projectAgent = projectAgentTotals.get(ev.project)
    if (!projectAgent) {
      projectAgent = { project: ev.project, total: 0, agents: new Map() }
      projectAgentTotals.set(ev.project, projectAgent)
    }
    projectAgent.total += periodDuration
    const agent = projectAgent.agents.get(ev.agent) ?? { total: 0, turns: new Set<string>() }
    agent.total += periodDuration
    if (ev.turn_id) agent.turns.add(ev.turn_id)
    projectAgent.agents.set(ev.agent, agent)

    const startedAt = ev.turn_id
      ? (turnStarts.get(ev.turn_id)?.ts ?? ev.ts - periodDuration)
      : ev.ts - periodDuration
    turnDurations.push({
      project: ev.project,
      agent: ev.agent,
      turnId: ev.turn_id ?? null,
      startedAt,
      endedAt: ev.ts,
      duration: periodDuration,
    })

    for (const allocation of allocateDurationByLocalHour({
      endTs: ev.ts,
      durationSec: ev.duration_sec,
      startTs: ev.turn_id ? turnStarts.get(ev.turn_id)?.ts : undefined,
      rangeStart: periodStart,
      rangeEnd,
    })) {
      const key = `${weekdayIndex(allocation.hourStart)}:${new Date(allocation.hourStart * 1000).getHours()}`
      hourlyTotals.set(key, (hourlyTotals.get(key) ?? 0) + allocation.duration)
    }
  }

  for (const ev of completedTurnEventsInWindow(events, previousPeriodStart, periodStart)) {
    const duration = completedDuration(ev, turnStarts, previousPeriodStart, periodStart)
    if (duration === null || duration <= 0) continue
    previousPeriodTotal += duration
  }

  const topProjects = [...periodProjectTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([project]) => project)
  const topProjectSet = new Set(topProjects)
  const hasOthers = [...periodProjectTotals.keys()].some((project) => !topProjectSet.has(project))
  const trendProjects = hasOthers ? [...topProjects, 'Others'] : topProjects

  for (const date of denseDateKeys(options.periodDays, now)) {
    trendProjectDayTotals.set(date, new Map(trendProjects.map((project) => [project, 0])))
  }

  for (const ev of completedTurnEventsInWindow(events, periodStart, rangeEnd)) {
    if (isUnknownDurationEnd(ev)) continue

    const allocations = allocateDurationByLocalDay({
      endTs: ev.ts,
      durationSec: ev.duration_sec,
      startTs: ev.turn_id ? turnStarts.get(ev.turn_id)?.ts : undefined,
      rangeStart: periodStart,
      rangeEnd,
    })
    const bucket = topProjectSet.has(ev.project) ? ev.project : 'Others'
    if (!trendProjects.includes(bucket)) continue

    for (const allocation of allocations) {
      const day = trendProjectDayTotals.get(allocation.day)
      if (!day) continue
      day.set(bucket, (day.get(bucket) ?? 0) + allocation.duration)
    }
  }

  return {
    periodDays: options.periodDays,
    calendar: [...calendarTotals.entries()].map(([date, total]) => ({ date, total })),
    trendProjects,
    trends: [...trendProjectDayTotals.entries()].map(([date, projects]) => ({
      date,
      projects: Object.fromEntries(projects),
    })),
    topProjects: [...topProjectRows.values()]
      .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project))
      .map((row) => ({
        project: row.project,
        total: row.total,
        turns: row.turns.size,
        lastActive: row.lastActive,
      })),
    hourlyMatrix: Array.from({ length: 7 }, (_, weekday) =>
      Array.from({ length: 24 }, (_, hour) => ({
        weekday,
        hour,
        total: hourlyTotals.get(`${weekday}:${hour}`) ?? 0,
      })),
    ).flat(),
    turnDurations: turnDurations.sort((a, b) => a.endedAt - b.endedAt),
    projectAgentTotals: [...projectAgentTotals.values()]
      .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project))
      .map((project) => ({
        project: project.project,
        total: project.total,
        agents: [...project.agents.entries()]
          .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
          .map(([agent, data]) => ({
            agent,
            total: data.total,
            turns: data.turns.size,
          })),
      })),
    periodCompare: {
      currentTotal: currentPeriodTotal,
      previousTotal: previousPeriodTotal,
      delta: currentPeriodTotal - previousPeriodTotal,
      deltaRatio:
        previousPeriodTotal > 0
          ? (currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal
          : null,
    },
  }
}
