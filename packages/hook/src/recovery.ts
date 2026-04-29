// Crash recovery for orphaned and stale open_turns.
// REC-01: recoverOrphans on session_start — creates synthetic turn_end with meta.abandoned=true.
// REC-02: sweepStale on CLI/desktop launch — creates synthetic turn_end with meta.reason="stale_sweep".
// Both never throw (PRD §7).

import type { Database } from 'bun:sqlite'
import type { NormalizedEvent } from '@vibetime/core'
import { queryOpenTurns, deleteOpenTurn, persistEvent } from './store.js'
import { appendLog } from './log.js'
import { STALE_TURN_MAX_AGE } from './constants.js'

/**
 * Recover orphaned open_turns for a specific session.
 * Called on session_start to handle crashes from previous runs.
 * Creates synthetic turn_end events with meta.abandoned = true.
 */
export function recoverOrphans(db: Database, sessionId: string): void {
  try {
    const orphans = queryOpenTurns(db, sessionId)

    for (const orphan of orphans) {
      // Create synthetic turn_end event
      const syntheticEvent: NormalizedEvent = {
        agent: orphan.agent as NormalizedEvent['agent'],
        event_type: 'turn_end',
        project: orphan.project,
        session_id: orphan.session_id,
        turn_id: orphan.turn_id,
        ts: Math.floor(Date.now() / 1000),
        timezone: orphan.timezone,
        duration_sec: null, // Unknown duration for abandoned turns
        meta: { abandoned: true },
      }

      // Persist the synthetic event (also removes from open_turns via store logic)
      persistEvent(db, syntheticEvent)

      // Reset duration_sec to NULL — persistEvent computes it from open_turns,
      // but for abandoned turns the duration is truly unknown (ts is detection time, not end time)
      db.query("UPDATE events SET duration_sec = NULL WHERE turn_id = ? AND event_type = 'turn_end'")
        .run(orphan.turn_id)

      // Explicit delete for safety — persistEvent handles turn_end cleanup but
      // we guard against edge cases where the turn_id might not match
      deleteOpenTurn(db, orphan.turn_id)

      appendLog(`Recovered orphan turn ${orphan.turn_id} for session ${sessionId}`)
    }
  } catch (err) {
    // Recovery failure should not block hook main flow
    appendLog(`Error in recoverOrphans: ${err}`)
  }
}

/**
 * Sweep stale open_turns older than STALE_TURN_MAX_AGE (6 hours).
 * Called on CLI/desktop launch, NOT on hook hot path.
 * Creates synthetic turn_end events with meta.reason = "stale_sweep".
 */
export function sweepStale(db: Database): void {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - STALE_TURN_MAX_AGE
    const allOpenTurns = queryOpenTurns(db)

    for (const turn of allOpenTurns) {
      if (turn.started_at < cutoff) {
        // Create synthetic turn_end event
        const syntheticEvent: NormalizedEvent = {
          agent: turn.agent as NormalizedEvent['agent'],
          event_type: 'turn_end',
          project: turn.project,
          session_id: turn.session_id,
          turn_id: turn.turn_id,
          ts: Math.floor(Date.now() / 1000),
          timezone: turn.timezone,
          duration_sec: null, // Unknown duration for stale turns
          meta: { reason: 'stale_sweep' },
        }

        // Persist the synthetic event
        persistEvent(db, syntheticEvent)

        // Reset duration_sec to NULL — persistEvent computes it from open_turns,
        // but for stale turns the duration is truly unknown (ts is sweep time, not end time)
        db.query("UPDATE events SET duration_sec = NULL WHERE turn_id = ? AND event_type = 'turn_end'")
          .run(turn.turn_id)

        // Explicit delete for safety
        deleteOpenTurn(db, turn.turn_id)

        appendLog(`Swept stale turn ${turn.turn_id} (started at ${turn.started_at})`)
      }
    }
  } catch (err) {
    // Sweep failure should not block CLI/desktop
    appendLog(`Error in sweepStale: ${err}`)
  }
}
