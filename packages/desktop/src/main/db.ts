import { existsSync, type FSWatcher, mkdirSync, readFileSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { NormalizedEvent } from '@vibetime/core'
import { DDL_EVENTS, DDL_INDICES, DDL_OPEN_TURNS, findCodexTurnCompletion } from '@vibetime/core'
import Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import type {
  ActiveTurn,
  AgentStatus,
  IpcPushEvent,
  TodayLiveState,
  TodaySummary,
} from '../shared/ipc-types.js'

type DbEvent = Omit<NormalizedEvent, 'duration_sec' | 'meta'> & {
  duration_sec: number | null
  meta: Record<string, unknown> | string | null
}

const DB_PATH = join(homedir(), '.vibetime', 'data.db')
const DB_DIR = join(homedir(), '.vibetime')
const DB_FILES = new Set(['data.db', 'data.db-wal', 'data.db-shm'])

let db: Database.Database | null = null
let dbWatcher: FSWatcher | null = null
let notifyTimer: ReturnType<typeof setTimeout> | null = null

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
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
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

function completedDuration(ev: DbEvent, turnStarts: Map<string, { ts: number }>): number | null {
  if (typeof ev.duration_sec === 'number') {
    return Math.max(0, ev.duration_sec)
  }

  if (isUnknownDurationEnd(ev)) {
    return null
  }

  const start = ev.turn_id ? turnStarts.get(ev.turn_id) : undefined
  return start && ev.turn_id ? Math.max(0, ev.ts - start.ts) : null
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

    const duration = completedDuration(ev, turnStarts)
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
  const hasVibetimeCommand = (command: unknown): command is string =>
    typeof command === 'string' && command.includes('vibetime-hook')
  const hasCodexHooksFeature = (): boolean => {
    const path = `${process.env.HOME}/.codex/config.toml`
    if (!existsSync(path)) return false
    const content = readFileSync(path, 'utf-8')
    return /^\s*codex_hooks\s*=\s*true\b/m.test(content)
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
          const path = `${process.env.HOME}/.codex/hooks.json`
          if (!existsSync(path)) return false
          if (!hasCodexHooksFeature()) return false
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
