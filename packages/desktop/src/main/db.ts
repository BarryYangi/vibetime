import { existsSync, type FSWatcher, mkdirSync, readFileSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { NormalizedEvent } from '@vibetime/core'
import {
  buildHistorySummaryFromEvents,
  durationWithinWindow,
  HISTORY_TURN_START_BUFFER_SEC,
  type HistoryPeriodDays,
  type HistorySummary,
  historyLowerBound,
} from '@vibetime/core'
import { getManagedCliPath } from '@vibetime/hook/install'
import type Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import { formatDurationMinuteSummary } from '../shared/format.js'
import type {
  ActiveTurn,
  AgentStatus,
  IpcPushEvent,
  MenubarState,
  TodayLiveState,
  TodaySummary,
} from '../shared/ipc-types.js'
import { findCodexTurnCompletion } from './codex-transcript.js'
import { DB_DIR, DB_FILES, openDesktopDb } from './desktop-db.js'
import { logger } from './logger.js'

type DbEvent = Omit<NormalizedEvent, 'duration_sec' | 'meta'> & {
  duration_sec: number | null
  meta: Record<string, unknown> | string | null
}

// Background reconciliation cadence. Codex transcript fallbacks are best-effort;
// 30s is fresh enough for UI without thrashing disk I/O.
const RECONCILE_INTERVAL_MS = 30_000

let db: Database.Database | null = null
let dbWatcher: FSWatcher | null = null
let notifyTimer: ReturnType<typeof setTimeout> | null = null
let dbChangeListener: ((event: IpcPushEvent) => void) | null = null
let reconcileTimer: ReturnType<typeof setInterval> | null = null

export function setDbChangeListener(listener: ((event: IpcPushEvent) => void) | null): void {
  dbChangeListener = listener
}

export function getDb(): Database.Database {
  if (!db) {
    db = openDesktopDb()
  }
  return db
}

export { initializeDesktopDbSchema } from './desktop-db.js'

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

function runReconcileOnce(): void {
  try {
    const handle = getDb()
    reconcileCodexCompletedTurns(handle)
    discardInactiveOpenTurns(handle)
  } catch (err) {
    // Reconcile is best-effort. A failure must not affect read paths or crash
    // the main process — log and move on.
    logger.error('reconcile loop failed', err)
  }
}

export function startReconcileLoop(): void {
  if (reconcileTimer) return
  // Immediate kickoff so the first UI read after launch sees fresh data.
  runReconcileOnce()
  reconcileTimer = setInterval(runReconcileOnce, RECONCILE_INTERVAL_MS)
}

export function stopReconcileLoop(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer)
    reconcileTimer = null
  }
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
        // Store only the file basename so the local home path doesn't end up
        // in db exports / shared diagnostics. The session_id + basename is
        // enough to relocate the transcript under ~/.codex/sessions/.
        meta: JSON.stringify({
          reason: 'codex_task_complete_fallback',
          transcript_file: basename(transcriptPath),
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

// Single-pass scan of all events the History summary needs. Pulls everything
// inside [lowerBound, rangeEnd) plus turn_start events from the buffer zone so
// that turn_ends straddling the window edge can still be anchored by their
// originating turn_start (see HISTORY_TURN_START_BUFFER_SEC).
function queryEventsForHistory(
  db: Database.Database,
  rangeEnd: number,
  periodDays: HistoryPeriodDays,
): DbEvent[] {
  const lowerBound = historyLowerBound(rangeEnd, periodDays)
  return db
    .prepare(`
      SELECT * FROM events
      WHERE ts < ?
        AND (
          ts >= ?
          OR (event_type = 'turn_start' AND ts >= ?)
        )
      ORDER BY ts ASC
    `)
    .all(rangeEnd, lowerBound, lowerBound - HISTORY_TURN_START_BUFFER_SEC) as DbEvent[]
}

export function queryHistorySummary(options: { periodDays: HistoryPeriodDays }): HistorySummary {
  const db = getDb()
  // Reconcile runs on a background tick (see startReconcileLoop). Read paths
  // stay pure — no file I/O, no writes — so opening History never blocks on
  // transcript scanning.

  return db.transaction(() => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const rangeEnd = startOfLocalDay(tomorrow)
    const events = queryEventsForHistory(db, rangeEnd, options.periodDays)
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
  if (total <= 0) return state.active ? '<1m' : '0m'
  return formatDurationMinuteSummary(total)
}

export function formatMenubarTooltip(state: MenubarState): string {
  const visibleDuration = formatMenubarTitle(state)
  return `VibeTime: ${visibleDuration} today - ${state.active ? 'running' : 'idle'}`
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
  // Reconcile runs on a background tick (see startReconcileLoop). Read paths
  // stay pure so the menubar / today view never block on file I/O.

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
  const agents = ['claude-code', 'codex', 'cursor', 'gemini-cli'] as const
  const managedCliPath = getManagedCliPath()
  const homeDir = homedir()
  const hasVibetimeCommand = (command: unknown): command is string => {
    if (typeof command !== 'string') return false
    if (!existsSync(managedCliPath)) return false
    return command.includes(managedCliPath) && command.includes('--source')
  }
  const hasCodexHooksFeature = (): boolean => {
    const path = join(homeDir, '.codex', 'config.toml')
    if (!existsSync(path)) return false
    const content = readFileSync(path, 'utf-8')
    return /^\s*hooks\s*=\s*true\b/m.test(content)
  }
  const hasCodexInlineHook = (): boolean => {
    const path = join(homeDir, '.codex', 'config.toml')
    if (!existsSync(path)) return false
    const content = readFileSync(path, 'utf-8')
    return content.includes('[[hooks.UserPromptSubmit.hooks]]') && hasVibetimeCommand(content)
  }

  function checkAgent(agent: string): boolean {
    try {
      switch (agent) {
        case 'claude-code': {
          const path = join(homeDir, '.claude', 'settings.json')
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
          return hasCodexInlineHook()
        }
        case 'cursor': {
          const path = join(homeDir, '.cursor', 'hooks.json')
          if (!existsSync(path)) return false
          const data = JSON.parse(readFileSync(path, 'utf-8'))
          return Object.values((data.hooks ?? {}) as Record<string, unknown[]>).some((hooks) =>
            hooks.some((hook) => hasVibetimeCommand((hook as { command?: unknown }).command)),
          )
        }
        case 'gemini-cli': {
          const path = join(homeDir, '.gemini', 'settings.json')
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
