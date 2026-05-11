// SQLite storage layer for vibetime hook. Uses bun:sqlite with WAL mode.
// PRAGMA setup per STORE-01, DDL with IF NOT EXISTS per FND-03 invariant.
// All write operations use prepared statements (T-03-04 mitigation).
// All operations wrapped in try/catch — never throws (PRD §7).

import { Database } from 'bun:sqlite'
import type { NormalizedEvent } from '@vibetime/core'
import { DDL_EVENTS, DDL_INDICES, DDL_OPEN_TURNS } from '@vibetime/core'
import { DB_PATH } from './constants.js'
import { ensureVibetimeDir } from './fs.js'
import { recordPersistFailure, recordPersistSuccess } from './health.js'
import { appendLog } from './log.js'

export interface StoredOpenTurn {
  turn_id: string
  agent: string
  project: string
  session_id: string
  started_at: number
  timezone: string
  meta: string | null
}

export type PersistableEvent = Omit<NormalizedEvent, 'duration_sec' | 'meta' | 'turn_id'> & {
  duration_sec?: number | null | undefined
  meta?: Record<string, unknown> | undefined
  turn_id?: string | undefined
}

function mergeMetaJson(existing: string | null, patch: Record<string, unknown>): string {
  if (!existing) return JSON.stringify(patch)
  try {
    const parsed = JSON.parse(existing)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, ...patch })
    }
  } catch {
    // Fall through to replacing malformed meta with the new trusted patch.
  }
  return JSON.stringify(patch)
}

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
export function persistEvent(db: Database, event: PersistableEvent): void {
  try {
    db.transaction(() => {
      const inferredEndTurn =
        event.event_type === 'turn_end' && !event.turn_id
          ? (db
              .query(`
                SELECT turn_id, started_at
                FROM open_turns
                WHERE agent = $agent
                  AND session_id = $session_id
                ORDER BY started_at DESC
                LIMIT 1
              `)
              .get({
                $agent: event.agent,
                $session_id: event.session_id,
              }) as { turn_id: string; started_at: number } | undefined)
          : undefined
      const effectiveTurnId = event.turn_id ?? inferredEndTurn?.turn_id

      if (
        event.event_type === 'turn_start' &&
        !effectiveTurnId &&
        event.meta &&
        Object.keys(event.meta).length > 0
      ) {
        const openTurn = db
          .query(`
            SELECT turn_id, meta
            FROM open_turns
            WHERE agent = $agent
              AND session_id = $session_id
            ORDER BY started_at DESC
            LIMIT 1
          `)
          .get({
            $agent: event.agent,
            $session_id: event.session_id,
          }) as { turn_id: string; meta: string | null } | undefined

        if (!openTurn) return

        const meta = mergeMetaJson(openTurn.meta, event.meta)
        db.query('UPDATE open_turns SET meta = $meta WHERE turn_id = $turn_id').run({
          $meta: meta,
          $turn_id: openTurn.turn_id,
        })
        db.query(`
          UPDATE events
          SET meta = $meta
          WHERE id = (
            SELECT id
            FROM events
            WHERE turn_id = $turn_id
              AND event_type = 'turn_start'
            ORDER BY ts DESC
            LIMIT 1
          )
        `).run({
          $meta: meta,
          $turn_id: openTurn.turn_id,
        })
        return
      }

      const hasNewerOpenTurn =
        event.event_type === 'turn_start' && effectiveTurnId
          ? Boolean(
              db
                .query(`
                SELECT 1
                FROM open_turns
                WHERE agent = $agent
                  AND session_id = $session_id
                  AND started_at > $ts
                LIMIT 1
              `)
                .get({
                  $agent: event.agent,
                  $session_id: event.session_id,
                  $ts: event.ts,
                }),
            )
          : false

      if (event.event_type === 'turn_start' && effectiveTurnId) {
        db.query(`
          DELETE FROM open_turns
          WHERE agent = $agent
            AND session_id = $session_id
            AND turn_id != $turn_id
            AND started_at <= $ts
        `).run({
          $agent: event.agent,
          $session_id: event.session_id,
          $turn_id: effectiveTurnId,
          $ts: event.ts,
        })

        const existingOpenTurn = db
          .query('SELECT 1 FROM open_turns WHERE turn_id = ? LIMIT 1')
          .get(effectiveTurnId)
        if (existingOpenTurn) {
          appendLog(`Skipped duplicate turn_start for ${event.agent}:${effectiveTurnId}`)
          return
        }
      }

      const explicitDuration = event.duration_sec
      const open =
        event.event_type === 'turn_end' && effectiveTurnId
          ? (inferredEndTurn ??
            (db.query('SELECT started_at FROM open_turns WHERE turn_id = ?').get(effectiveTurnId) as
              | { started_at: number }
              | undefined))
          : undefined
      const durationSec =
        open && explicitDuration === undefined
          ? Math.max(0, event.ts - open.started_at)
          : (explicitDuration ?? null)
      const meta = event.meta ? JSON.stringify(event.meta) : null

      db.query(`
        INSERT INTO events (schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta)
        VALUES (1, $agent, $event_type, $project, $session_id, $turn_id, $ts, $timezone, $duration_sec, $meta)
      `).run({
        $agent: event.agent,
        $event_type: event.event_type,
        $project: event.project,
        $session_id: event.session_id,
        $turn_id: effectiveTurnId ?? null,
        $ts: event.ts,
        $timezone: event.timezone,
        $duration_sec: durationSec,
        $meta: meta,
      })

      if (event.event_type === 'turn_start' && effectiveTurnId && !hasNewerOpenTurn) {
        db.query(`
          INSERT OR REPLACE INTO open_turns (turn_id, agent, project, session_id, started_at, timezone, meta)
          VALUES ($turn_id, $agent, $project, $session_id, $ts, $timezone, $meta)
        `).run({
          $turn_id: effectiveTurnId,
          $agent: event.agent,
          $project: event.project,
          $session_id: event.session_id,
          $ts: event.ts,
          $timezone: event.timezone,
          $meta: meta,
        })
      } else if (event.event_type === 'turn_end' && effectiveTurnId) {
        db.query('DELETE FROM open_turns WHERE turn_id = ?').run(effectiveTurnId)
      }
    })()
    // Clear any pending failure streak so `vibetime health` stops surfacing
    // a stale warning once writes are healthy again.
    recordPersistSuccess()
  } catch (err) {
    appendLog(`Error persisting event: ${err}`)
    recordPersistFailure({
      message: err instanceof Error ? err.message : String(err),
      agent: event.agent,
      event_type: event.event_type,
    })
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
    const params: Record<string, string | number> = {}

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

    return db.query<NormalizedEvent, Record<string, string | number>>(sql).all(params)
  } catch (err) {
    appendLog(`Error querying events: ${err}`)
    return []
  }
}

/**
 * Query open turns for crash recovery.
 */
export function queryOpenTurns(db: Database, sessionId?: string): StoredOpenTurn[] {
  try {
    if (sessionId) {
      return db
        .query('SELECT * FROM open_turns WHERE session_id = ?')
        .all(sessionId) as StoredOpenTurn[]
    }
    return db.query('SELECT * FROM open_turns').all() as StoredOpenTurn[]
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
