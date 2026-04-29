// Crash recovery for vibetime hook.
// REC-01: orphan sweep on session_start.
// REC-02: stale sweep at CLI/desktop launch.
// All operations wrapped in try/catch — never throws.

import type { Database } from 'bun:sqlite'
import type { Agent } from '@vibetime/core'
import { STALE_TURN_MAX_AGE } from './constants.js'
import { appendLog } from './log.js'

interface OpenTurnRow {
  turn_id: string
  agent: string
  project: string
  session_id: string
  started_at: number
  timezone: string
  meta: string | null
}

/**
 * Recover orphan open turns for a given session (REC-01).
 * Called on session_start — closes any turns left open from a prior crash.
 */
export function recoverOrphans(db: Database, sessionId: string): void {
  try {
    const orphans = db
      .query('SELECT * FROM open_turns WHERE session_id = ?')
      .all(sessionId) as OpenTurnRow[]

    for (const orphan of orphans) {
      try {
        const now = Math.floor(Date.now() / 1000)
        const duration = now - orphan.started_at

        // Insert synthetic turn_end with abandoned flag
        db.query(`
          INSERT INTO events (schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta)
          VALUES (1, $agent, 'turn_end', $project, $session_id, $turn_id, $ts, $timezone, $duration_sec, $meta)
        `).run({
          $agent: orphan.agent,
          $project: orphan.project,
          $session_id: orphan.session_id,
          $turn_id: orphan.turn_id,
          $ts: now,
          $timezone: orphan.timezone,
          $duration_sec: duration,
          $meta: orphan.meta
            ? JSON.stringify({ ...JSON.parse(orphan.meta), abandoned: true })
            : JSON.stringify({ abandoned: true }),
        })

        // Update the turn_start event with duration
        db.query(
          "UPDATE events SET duration_sec = $dur WHERE turn_id = $turn_id AND event_type = 'turn_start'",
        ).run({ $dur: duration, $turn_id: orphan.turn_id })

        // Delete orphan row
        db.query('DELETE FROM open_turns WHERE turn_id = ?').run(orphan.turn_id)
      } catch (err) {
        appendLog(`Error recovering orphan turn ${orphan.turn_id}: ${err}`)
      }
    }
  } catch (err) {
    // Recovery failure should not block hook main flow
    appendLog(`Error in recoverOrphans: ${err}`)
  }
}

/**
 * Sweep stale open turns (REC-02).
 * Called at CLI/desktop launch — closes turns older than STALE_TURN_MAX_AGE (6h).
 */
export function sweepStale(db: Database, maxAgeSec: number = STALE_TURN_MAX_AGE): void {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - maxAgeSec
    const stale = db
      .query('SELECT * FROM open_turns WHERE started_at < ?')
      .all(cutoff) as OpenTurnRow[]

    for (const row of stale) {
      try {
        const now = Math.floor(Date.now() / 1000)
        const duration = now - row.started_at

        // Insert synthetic turn_end with stale flag
        db.query(`
          INSERT INTO events (schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta)
          VALUES (1, $agent, 'turn_end', $project, $session_id, $turn_id, $ts, $timezone, $duration_sec, $meta)
        `).run({
          $agent: row.agent,
          $project: row.project,
          $session_id: row.session_id,
          $turn_id: row.turn_id,
          $ts: now,
          $timezone: row.timezone,
          $duration_sec: duration,
          $meta: row.meta
            ? JSON.stringify({ ...JSON.parse(row.meta), stale: true })
            : JSON.stringify({ stale: true }),
        })

        // Update the turn_start event with duration
        db.query(
          "UPDATE events SET duration_sec = $dur WHERE turn_id = $turn_id AND event_type = 'turn_start'",
        ).run({ $dur: duration, $turn_id: row.turn_id })

        // Delete stale row
        db.query('DELETE FROM open_turns WHERE turn_id = ?').run(row.turn_id)
      } catch (err) {
        appendLog(`Error sweeping stale turn ${row.turn_id}: ${err}`)
      }
    }
  } catch (err) {
    appendLog(`Error in sweepStale: ${err}`)
  }
}
