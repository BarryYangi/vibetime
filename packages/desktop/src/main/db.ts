import { existsSync, type FSWatcher, mkdirSync, readFileSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { NormalizedEvent } from '@vibetime/core'
import {
  allocateDurationByLocalDay,
  DDL_EVENTS,
  DDL_INDICES,
  DDL_OPEN_TURNS,
  durationWithinWindow,
} from '@vibetime/core'
import { getManagedCliPath } from '@vibetime/hook/install'
import Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import type {
  ActiveTurn,
  AgentStatus,
  HistorySummary,
  IpcPushEvent,
  MenubarState,
  TodayLiveState,
  TodaySummary,
} from '../shared/ipc-types.js'
import { findCodexTurnCompletion } from './codex-transcript.js'

type DbEvent = Omit<NormalizedEvent, 'duration_sec' | 'meta'> & {
  duration_sec: number | null
  meta: Record<string, unknown> | string | null
}

type PeriodDays = 7 | 30 | 90 | 365

const DB_PATH = join(homedir(), '.vibetime', 'data.db')
const DB_DIR = join(homedir(), '.vibetime')
const DB_FILES = new Set(['data.db', 'data.db-wal', 'data.db-shm'])

let db: Database.Database | null = null
let dbWatcher: FSWatcher | null = null
let notifyTimer: ReturnType<typeof setTimeout> | null = null
let dbChangeListener: ((event: IpcPushEvent) => void) | null = null

export function setDbChangeListener(listener: ((event: IpcPushEvent) => void) | null): void {
  dbChangeListener = listener
}

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true, mode: 0o700 })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    db.pragma('foreign_keys = ON')
    db.exec(DDL_EVENTS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
    db.exec(DDL_OPEN_TURNS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
    for (const idx of DDL_INDICES) {
      db.exec(idx.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'))
    }
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function startDbChangeWatcher(): void {
  if (dbWatcher) return

  mkdirSync(DB_DIR, { recursive: true, mode: 0o700 })
  dbWatcher = watch(DB_DIR, (_eventType, filename) => {
    if (!filename || !DB_FILES.has(filename.toString())) return

    if (notifyTimer) clearTimeout(notifyTimer)
    notifyTimer = setTimeout(() => {
      notifyTimer = null
      notifyRenderer()
    }, 100)
  })

  dbWatcher.on('error', () => {
    dbWatcher?.close()
    dbWatcher = null
  })
}

export function stopDbChangeWatcher(): void {
  if (notifyTimer) {
    clearTimeout(notifyTimer)
    notifyTimer = null
  }
  dbWatcher?.close()
  dbWatcher = null
}

export function notifyRenderer(event: IpcPushEvent = { type: 'db-changed' }): void {
  try {
    dbChangeListener?.(event)
  } catch {
    // Renderer push must continue even if the native menu title refresh fails.
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('push', event)
  }
}

export function writeAndNotify(fn: () => void): void {
  fn()
  notifyRenderer()
}

function reconcileCodexCompletedTurns(db: Database.Database): void {
  const openTurns = db.prepare("SELECT * FROM open_turns WHERE agent = 'codex'").all() as Array<{
    turn_id: string
    agent: string
    project: string
    session_id: string
    started_at: number
    timezone: string
  }>

  const hasTurnEnd = db.prepare(
    "SELECT 1 FROM events WHERE turn_id = ? AND event_type = 'turn_end' LIMIT 1",
  )
  const insertTurnEnd = db.prepare(`
    INSERT INTO events (schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta)
    VALUES (1, $agent, 'turn_end', $project, $session_id, $turn_id, $ts, $timezone, $duration_sec, $meta)
  `)
  const deleteOpenTurn = db.prepare('DELETE FROM open_turns WHERE turn_id = ?')

  const reconcileTurn = db.transaction(
    (turn: (typeof openTurns)[number], completedAt: number, transcriptPath: string) => {
      if (hasTurnEnd.get(turn.turn_id)) {
        deleteOpenTurn.run(turn.turn_id)
        return
      }

      insertTurnEnd.run({
        agent: 'codex',
        project: turn.project,
        session_id: turn.session_id,
        turn_id: turn.turn_id,
        ts: completedAt,
        timezone: turn.timezone,
        duration_sec: Math.max(0, completedAt - turn.started_at),
        meta: JSON.stringify({
          reason: 'codex_task_complete_fallback',
          transcript_path: transcriptPath,
        }),
      })
      deleteOpenTurn.run(turn.turn_id)
    },
  )

  for (const turn of openTurns) {
    const completion = findCodexTurnCompletion({
      sessionId: turn.session_id,
      turnId: turn.turn_id,
      startedAt: turn.started_at,
    })
    if (!completion) continue
    reconcileTurn(turn, completion.completedAt, completion.transcriptPath)
  }
}

function parseEventMeta(meta: DbEvent['meta']): Record<string, unknown> | null {
  if (!meta) return null
  if (typeof meta !== 'string') return meta

  try {
    const parsed = JSON.parse(meta)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isUnknownDurationEnd(ev: DbEvent): boolean {
  const meta = parseEventMeta(ev.meta)
  return meta?.abandoned === true || meta?.reason === 'stale_sweep'
}

function completedDuration(
  ev: DbEvent,
  turnStarts: Map<string, { ts: number }>,
  windowStart: number,
  windowEnd: number,
): number | null {
  if (isUnknownDurationEnd(ev)) {
    return null
  }

  const start = ev.turn_id ? turnStarts.get(ev.turn_id) : undefined
  return durationWithinWindow({
    endTs: ev.ts,
    durationSec: ev.duration_sec,
    startTs: start?.ts,
    windowStart,
    windowEnd,
  })
}

function buildTodaySummary(db: Database.Database, now: Date): TodaySummary {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const from = Math.floor(startOfDay.getTime() / 1000)
  const to = Math.floor(startOfTomorrow.getTime() / 1000)

  const events = db
    .prepare('SELECT * FROM events WHERE ts >= ? AND ts < ? ORDER BY ts ASC')
    .all(from, to) as DbEvent[]

  const projectMap = new Map<string, { total: number; agents: Map<string, number> }>()
  const completedTurns = new Set<string>()
  const turnStarts = new Map<string, { ts: number }>()

  for (const ev of events) {
    if (ev.event_type === 'turn_start' && ev.turn_id) {
      const existingStart = turnStarts.get(ev.turn_id)
      if (!existingStart || ev.ts < existingStart.ts) {
        turnStarts.set(ev.turn_id, { ts: ev.ts })
      }
    }
  }

  for (const ev of events) {
    if (ev.event_type !== 'turn_end') continue

    const duration = completedDuration(ev, turnStarts, from, to)
    if (duration === null) continue

    if (ev.turn_id) {
      completedTurns.add(ev.turn_id)
    }

    if (duration <= 0) continue

    let entry = projectMap.get(ev.project)
    if (!entry) {
      entry = { total: 0, agents: new Map() }
      projectMap.set(ev.project, entry)
    }

    entry.total += duration
    entry.agents.set(ev.agent, (entry.agents.get(ev.agent) ?? 0) + duration)
  }

  const projects = [...projectMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => ({
      name,
      total: data.total,
      agents: [...data.agents.entries()]
        .filter(([, t]) => t > 0)
        .map(([agent, total]) => ({ agent, total })),
    }))

  return {
    date: now.toLocaleDateString('en-CA'), // YYYY-MM-DD
    grandTotal: projects.reduce((sum, p) => sum + p.total, 0),
    projects,
    turnCount: completedTurns.size,
    activeProjectCount: projectMap.size,
  }
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

function queryEventsBefore(db: Database.Database, to: number): DbEvent[] {
  return db.prepare('SELECT * FROM events WHERE ts < ? ORDER BY ts ASC').all(to) as DbEvent[]
}

function buildTurnStarts(events: DbEvent[]): Map<string, { ts: number }> {
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

function completedTurnEventsInWindow(events: DbEvent[], from: number, to: number): DbEvent[] {
  return events.filter((ev) => ev.event_type === 'turn_end' && ev.ts >= from && ev.ts < to)
}

function allocateDurationByLocalHour(input: {
  endTs: number
  durationSec: number | null
  startTs?: number
  rangeStart: number
  rangeEnd: number
}): Array<{ hourStart: number; duration: number }> {
  const rawStart =
    input.startTs ?? (input.durationSec === null ? input.endTs : input.endTs - input.durationSec)
  const start = Math.max(rawStart, input.rangeStart)
  const end = Math.min(input.endTs, input.rangeEnd)
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
  events: DbEvent[],
  options: { periodDays: PeriodDays; now?: Date },
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
  const turnDurations: Array<{
    project: string
    agent: string
    turnId: string | null
    startedAt: number
    endedAt: number
    duration: number
  }> = []
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
    turnDurations: turnDurations.sort((a, b) => a.endedAt - b.endedAt).slice(-500),
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

export function queryHistorySummary(options: { periodDays: PeriodDays }): HistorySummary {
  const db = getDb()
  reconcileCodexCompletedTurns(db)
  discardInactiveOpenTurns(db)

  return db.transaction(() => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const events = queryEventsBefore(db, startOfLocalDay(tomorrow))
    return buildHistorySummaryFromEvents(events, { periodDays: options.periodDays, now })
  })()
}

export function queryMenubarState(): MenubarState {
  const liveState = queryTodayLiveState()
  const activeTotals = new Map<string, number>()
  for (const turn of liveState.activeTurns) {
    const active = Math.max(0, liveState.serverNow - Math.max(turn.started_at, liveState.dayStart))
    activeTotals.set(turn.project, (activeTotals.get(turn.project) ?? 0) + active)
  }

  const projects = liveState.completed.projects
    .map((project) => ({
      name: project.name,
      total: project.total + (activeTotals.get(project.name) ?? 0),
    }))
    .concat(
      [...activeTotals.entries()]
        .filter(([name]) => !liveState.completed.projects.some((project) => project.name === name))
        .map(([name, total]) => ({ name, total })),
    )
    .filter((project) => project.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 3)

  return {
    todayTotal:
      liveState.completed.grandTotal + [...activeTotals.values()].reduce((a, b) => a + b, 0),
    active: liveState.activeTurns.length > 0,
    projects,
    activeTurns: liveState.activeTurns,
  }
}

export function formatMenubarTitle(state: MenubarState): string {
  const total = Math.max(0, Math.floor(state.todayTotal))
  if (total <= 0) return state.active ? '● <1m' : '●'
  if (total < 60) return '● <1m'

  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `● ${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes <= 0) return `● ${hours}h`
  return `● ${hours}h ${remainingMinutes}m`
}

function queryRevision(db: Database.Database): number {
  const row = db.prepare('SELECT COALESCE(MAX(id), 0) AS revision FROM events').get() as {
    revision: number
  }
  return row.revision
}

function discardInactiveOpenTurns(db: Database.Database): void {
  db.prepare(`
    DELETE FROM open_turns
    WHERE EXISTS (
      SELECT 1
      FROM events event
      WHERE event.turn_id = open_turns.turn_id
        AND event.event_type = 'turn_end'
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1
      FROM events later
      WHERE later.agent = open_turns.agent
        AND later.session_id = open_turns.session_id
        AND later.ts > open_turns.started_at
        AND later.event_type IN ('turn_start', 'turn_end', 'session_end')
        AND COALESCE(later.turn_id, '') <> open_turns.turn_id
      LIMIT 1
    )
  `).run()
}

function queryActiveTurns(db: Database.Database): ActiveTurn[] {
  return db
    .prepare(`
      SELECT turn_id, agent, project, session_id, started_at, timezone
      FROM open_turns open_turn
      WHERE NOT EXISTS (
        SELECT 1
        FROM events event
        WHERE event.turn_id = open_turn.turn_id
          AND event.event_type = 'turn_end'
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1
        FROM events later
        WHERE later.agent = open_turn.agent
          AND later.session_id = open_turn.session_id
          AND later.ts > open_turn.started_at
          AND later.event_type IN ('turn_start', 'turn_end', 'session_end')
          AND COALESCE(later.turn_id, '') <> open_turn.turn_id
        LIMIT 1
      )
      ORDER BY started_at ASC
    `)
    .all() as ActiveTurn[]
}

export function queryTodayLiveState(): TodayLiveState {
  const db = getDb()
  reconcileCodexCompletedTurns(db)
  discardInactiveOpenTurns(db)

  return db.transaction(() => {
    const serverNow = Date.now() / 1000
    const now = new Date(serverNow * 1000)
    const dayStart = Math.floor(
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000,
    )

    return {
      revision: queryRevision(db),
      serverNow,
      dayStart,
      completed: buildTodaySummary(db, now),
      activeTurns: queryActiveTurns(db),
    }
  })()
}

export function queryAgentStatus(): AgentStatus[] {
  const agents = ['claude-code', 'codex', 'cursor'] as const
  const managedCliPath = getManagedCliPath()
  const hasVibetimeCommand = (command: unknown): command is string => {
    if (typeof command !== 'string') return false
    if (!existsSync(managedCliPath)) return false
    return command.includes(managedCliPath) && command.includes('--source')
  }
  const hasCodexHooksFeature = (): boolean => {
    const path = `${process.env.HOME}/.codex/config.toml`
    if (!existsSync(path)) return false
    const content = readFileSync(path, 'utf-8')
    return /^\s*hooks\s*=\s*true\b/m.test(content)
  }

  function checkAgent(agent: string): boolean {
    try {
      switch (agent) {
        case 'claude-code': {
          const path = `${process.env.HOME}/.claude/settings.json`
          if (!existsSync(path)) return false
          const data = JSON.parse(readFileSync(path, 'utf-8'))
          return Object.values((data.hooks ?? {}) as Record<string, unknown[]>).some((groups) =>
            groups.some((group) =>
              ((group as { hooks?: Array<{ command?: unknown }> }).hooks ?? []).some((hook) =>
                hasVibetimeCommand(hook.command),
              ),
            ),
          )
        }
        case 'codex': {
          if (!hasCodexHooksFeature()) return false
          const path = `${process.env.HOME}/.codex/hooks.json`
          if (!existsSync(path)) return false
          const data = JSON.parse(readFileSync(path, 'utf-8'))
          return Object.values((data.hooks ?? {}) as Record<string, unknown[]>).some((groups) =>
            groups.some((group) =>
              ((group as { hooks?: Array<{ command?: unknown }> }).hooks ?? []).some((hook) =>
                hasVibetimeCommand(hook.command),
              ),
            ),
          )
        }
        case 'cursor': {
          const path = `${process.env.HOME}/.cursor/hooks.json`
          if (!existsSync(path)) return false
          const data = JSON.parse(readFileSync(path, 'utf-8'))
          return Object.values((data.hooks ?? {}) as Record<string, unknown[]>).some((hooks) =>
            hooks.some((hook) => hasVibetimeCommand((hook as { command?: unknown }).command)),
          )
        }
        default:
          return false
      }
    } catch {
      return false
    }
  }

  return agents.map((agent) => ({
    agent,
    installed: checkAgent(agent),
  }))
}
