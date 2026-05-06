// SQLite storage layer for vibetime hook. Uses bun:sqlite with WAL mode.
// PRAGMA setup per STORE-01, DDL with IF NOT EXISTS per FND-03 invariant.
// All write operations use prepared statements (T-03-04 mitigation).
// All operations wrapped in try/catch — never throws (PRD §7).

import { Database } from 'bun:sqlite'
import { DDL_EVENTS, DDL_OPEN_TURNS, DDL_INDICES } from '@vibetime/core'
import type { NormalizedEvent } from '@vibetime/core'
import { DB_PATH } from './constants.js'
import { ensureVibetimeDir } from './fs.js'
import { appendLog } from './log.js'

/**
 * Open (or create) the SQLite database with required PRAGMAs and tables.
 * Idempotent — safe to call on every hook invocation.
 */
export function openDatabase(path: string = DB_PATH): Database {
  ensureVibetimeDir()

  const db = new Database(path, { create: true })

  // PRAGMA setup per STORE-01
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = NORMAL')
  db.run('PRAGMA busy_timeout = 5000')
  db.run('PRAGMA foreign_keys = ON')

  // DDL with IF NOT EXISTS (core DDL omits it per FND-03 invariant)
  db.run(DDL_EVENTS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
  db.run(DDL_OPEN_TURNS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
  for (const idx of DDL_INDICES) {
    db.run(idx.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'))
  }

  return db
}

/**
 * Close the database connection safely.
 */
export function closeDatabase(db: Database): void {
  try {
    db.close()
  } catch (err) {
    appendLog(`Error closing database: ${err}`)
  }
}

/**
 * Persist a NormalizedEvent to the events table.
 * Also manages open_turns for crash recovery.
 */
export function persistEvent(db: Database, event: NormalizedEvent): void {
  try {
    if (event.event_type === 'turn_start' && event.turn_id) {
      const existingOpenTurn = db
        .query('SELECT 1 FROM open_turns WHERE turn_id = ? LIMIT 1')
        .get(event.turn_id)
      if (existingOpenTurn) {
        appendLog(`Skipped duplicate turn_start for ${event.agent}:${event.turn_id}`)
        return
      }
    }

    // Insert event — prepared statement with parameter binding (T-03-04)
    const insertEvent = db.query(`
      INSERT INTO events (schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta)
      VALUES (1, $agent, $event_type, $project, $session_id, $turn_id, $ts, $timezone, $duration_sec, $meta)
    `)

    insertEvent.run({
      $agent: event.agent,
      $event_type: event.event_type,
      $project: event.project,
      $session_id: event.session_id,
      $turn_id: event.turn_id ?? null,
      $ts: event.ts,
      $timezone: event.timezone,
      $duration_sec: event.duration_sec ?? null,
      $meta: event.meta ? JSON.stringify(event.meta) : null,
    })

    // Manage open_turns for crash recovery
    if (event.event_type === 'turn_start' && event.turn_id) {
      db.query(`
        INSERT OR REPLACE INTO open_turns (turn_id, agent, project, session_id, started_at, timezone, meta)
        VALUES ($turn_id, $agent, $project, $session_id, $ts, $timezone, $meta)
      `).run({
        $turn_id: event.turn_id,
        $agent: event.agent,
        $project: event.project,
        $session_id: event.session_id,
        $ts: event.ts,
        $timezone: event.timezone,
        $meta: event.meta ? JSON.stringify(event.meta) : null,
      })
    } else if (event.event_type === 'turn_end' && event.turn_id) {
      // Compute duration from open_turns
      const open = db.query('SELECT started_at FROM open_turns WHERE turn_id = ?').get(event.turn_id) as { started_at: number } | undefined
      if (open) {
        const duration = event.ts - open.started_at
        // Update the turn_end event with computed duration
        db.query("UPDATE events SET duration_sec = $dur WHERE turn_id = $turn_id AND event_type = 'turn_end'")
          .run({ $dur: duration, $turn_id: event.turn_id })
      }
      // Remove from open_turns
      db.query('DELETE FROM open_turns WHERE turn_id = ?').run(event.turn_id)
    }
  } catch (err) {
    appendLog(`Error persisting event: ${err}`)
    // Never throw — hook must exit 0
  }
}

/**
 * Query events for a specific date range.
 * Used by CLI commands (today, project, export).
 */
export function queryEvents(
  db: Database,
  options: { from?: number; to?: number; project?: string; agent?: string } = {},
): NormalizedEvent[] {
  try {
    let sql = 'SELECT * FROM events WHERE 1=1'
    const params: Record<string, unknown> = {}

    if (options.from) {
      sql += ' AND ts >= $from'
      params.$from = options.from
    }
    if (options.to) {
      sql += ' AND ts <= $to'
      params.$to = options.to
    }
    if (options.project) {
      sql += ' AND project = $project'
      params.$project = options.project
    }
    if (options.agent) {
      sql += ' AND agent = $agent'
      params.$agent = options.agent
    }

    sql += ' ORDER BY ts ASC'

    return db.query(sql).all(params) as NormalizedEvent[]
  } catch (err) {
    appendLog(`Error querying events: ${err}`)
    return []
  }
}

/**
 * Query open turns for crash recovery.
 */
export function queryOpenTurns(db: Database, sessionId?: string): Array<{
  turn_id: string
  agent: string
  project: string
  session_id: string
  started_at: number
  timezone: string
  meta: string | null
}> {
  try {
    if (sessionId) {
      return db.query('SELECT * FROM open_turns WHERE session_id = ?').all(sessionId) as Array<{
        turn_id: string
        agent: string
        project: string
        session_id: string
        started_at: number
        timezone: string
        meta: string | null
      }>
    }
    return db.query('SELECT * FROM open_turns').all() as Array<{
      turn_id: string
      agent: string
      project: string
      session_id: string
      started_at: number
      timezone: string
      meta: string | null
    }>
  } catch (err) {
    appendLog(`Error querying open turns: ${err}`)
    return []
  }
}

/**
 * Delete an open turn by turn_id.
 */
export function deleteOpenTurn(db: Database, turnId: string): void {
  try {
    db.query('DELETE FROM open_turns WHERE turn_id = ?').run(turnId)
  } catch (err) {
    appendLog(`Error deleting open turn: ${err}`)
  }
}
