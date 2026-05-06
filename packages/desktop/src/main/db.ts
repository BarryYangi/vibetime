import { existsSync, mkdirSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { NormalizedEvent } from '@vibetime/core'
import {
  DDL_EVENTS,
  DDL_INDICES,
  DDL_OPEN_TURNS,
  findCodexTaskCompletion,
} from '@vibetime/core'
import Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import type { AgentStatus, IpcPushEvent, OpenTurn, TodaySummary } from '../shared/ipc-types.js'

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

  const reconcileTurn = db.transaction((turn: (typeof openTurns)[number], completedAt: number, transcriptPath: string) => {
    if (hasTurnEnd.get(turn.turn_id)) {
      deleteOpenTurn.run(turn.turn_id)
      return
    }

    insertTurnEnd.run({
      $agent: 'codex',
      $project: turn.project,
      $session_id: turn.session_id,
      $turn_id: turn.turn_id,
      $ts: completedAt,
      $timezone: turn.timezone,
      $duration_sec: Math.max(0, completedAt - turn.started_at),
      $meta: JSON.stringify({
        reason: 'codex_task_complete_fallback',
        transcript_path: transcriptPath,
      }),
    })
    deleteOpenTurn.run(turn.turn_id)
  })

  for (const turn of openTurns) {
    const completion = findCodexTaskCompletion({
      sessionId: turn.session_id,
      turnId: turn.turn_id,
      startedAt: turn.started_at,
    })
    if (!completion) continue
    reconcileTurn(turn, completion.completedAt, completion.transcriptPath)
  }
}

export function queryTodaySummary(): TodaySummary {
  const db = getDb()
  reconcileCodexCompletedTurns(db)
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const from = Math.floor(startOfDay.getTime() / 1000)
  const to = Math.floor(now.getTime() / 1000)

  const events = db
    .prepare('SELECT * FROM events WHERE ts >= ? AND ts <= ? ORDER BY ts ASC')
    .all(from, to) as NormalizedEvent[]

  const projectMap = new Map<string, { total: number; agents: Map<string, number> }>()
  const distinctTurns = new Set<string>()
  const turnStarts = new Map<string, { agent: string; project: string; ts: number }>()

  for (const ev of events) {
    if (ev.event_type === 'turn_start' && ev.turn_id) {
      distinctTurns.add(ev.turn_id)
      const existingStart = turnStarts.get(ev.turn_id)
      if (!existingStart || ev.ts < existingStart.ts) {
        turnStarts.set(ev.turn_id, { agent: ev.agent, project: ev.project, ts: ev.ts })
      }
    }
  }

  for (const ev of events) {
    if (ev.event_type !== 'turn_end') continue

    let entry = projectMap.get(ev.project)
    if (!entry) {
      entry = { total: 0, agents: new Map() }
      projectMap.set(ev.project, entry)
    }

    const start = ev.turn_id ? turnStarts.get(ev.turn_id) : undefined
    const duration =
      start && ev.turn_id ? Math.max(0, ev.ts - start.ts) : (ev.duration_sec ?? 0)

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
    turnCount: distinctTurns.size,
    activeProjectCount: projectMap.size,
  }
}

export function queryOpenTurnsForIpc(): OpenTurn[] {
  const db = getDb()
  reconcileCodexCompletedTurns(db)
  const now = Math.floor(Date.now() / 1000)
  const rows = db.prepare('SELECT * FROM open_turns').all() as Array<{
    turn_id: string
    agent: string
    project: string
    session_id: string
    started_at: number
    timezone: string
  }>
  return rows.map((row) => ({
    ...row,
    elapsed: now - row.started_at,
  }))
}

export function queryAgentStatus(): AgentStatus[] {
  const agents = ['claude-code', 'codex', 'cursor'] as const
  const hasVibetimeCommand = (command: unknown): command is string =>
    typeof command === 'string' && command.includes('vibetime-hook')

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
