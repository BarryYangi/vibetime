// Tests for crash recovery module. Covers REC-01, REC-02.
// Uses bun:test — bun built-in test runner (CONTEXT.md D-TEST-HOOK).

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, closeDatabase, persistEvent, queryOpenTurns } from './store.js'
import { recoverOrphans, sweepStale } from './recovery.js'
import { STALE_TURN_MAX_AGE } from './constants.js'
import type { NormalizedEvent } from '@vibetime/core'

let tmpDir: string
let dbPath: string

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    agent: 'claude-code',
    event_type: 'turn_start',
    project: 'test-project',
    session_id: 'sess-1',
    turn_id: 'turn-1',
    ts: Math.floor(Date.now() / 1000),
    timezone: 'Asia/Tokyo',
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vibetime-recovery-test-'))
  dbPath = join(tmpDir, 'test.db')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── REC-01: recoverOrphans ────────────────────────────────────────────────

describe('recoverOrphans — orphan sweep on session_start (REC-01)', () => {
  it('creates synthetic turn_end for orphaned open_turns with meta.abandoned=true', () => {
    const db = openDatabase(dbPath)
    try {
      // Simulate a crashed turn — insert directly into open_turns via turn_start
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'orphan-1', session_id: 'sess-crashed' }))

      // Verify open_turns has 1 entry
      expect(queryOpenTurns(db, 'sess-crashed')).toHaveLength(1)

      // Run recovery
      recoverOrphans(db, 'sess-crashed')

      // open_turns should be empty
      expect(queryOpenTurns(db, 'sess-crashed')).toHaveLength(0)

      // Should have created a turn_end event with meta.abandoned=true
      const rows = db.query("SELECT * FROM events WHERE event_type = 'turn_end' AND turn_id = 'orphan-1'").all() as Array<Record<string, unknown>>
      expect(rows).toHaveLength(1)
      const meta = JSON.parse(rows[0].meta as string)
      expect(meta.abandoned).toBe(true)
    } finally {
      closeDatabase(db)
    }
  })

  it('sets duration_sec=null for abandoned turns', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'orphan-1', session_id: 'sess-1' }))

      recoverOrphans(db, 'sess-1')

      const rows = db.query("SELECT duration_sec FROM events WHERE event_type = 'turn_end'").all() as Array<{ duration_sec: number | null }>
      expect(rows).toHaveLength(1)
      expect(rows[0].duration_sec).toBeNull()
    } finally {
      closeDatabase(db)
    }
  })

  it('recovers multiple orphans in the same session', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'o1', session_id: 's1' }))
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'o2', session_id: 's1' }))
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'o3', session_id: 's1' }))

      expect(queryOpenTurns(db, 's1')).toHaveLength(3)

      recoverOrphans(db, 's1')

      expect(queryOpenTurns(db, 's1')).toHaveLength(0)

      const turnEnds = db.query("SELECT * FROM events WHERE event_type = 'turn_end'").all()
      expect(turnEnds).toHaveLength(3)
    } finally {
      closeDatabase(db)
    }
  })

  it('only recovers orphans for the specified session', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'o1', session_id: 'target' }))
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'o2', session_id: 'other' }))

      recoverOrphans(db, 'target')

      // Only target session's orphan should be recovered
      expect(queryOpenTurns(db, 'target')).toHaveLength(0)
      expect(queryOpenTurns(db, 'other')).toHaveLength(1)
    } finally {
      closeDatabase(db)
    }
  })

  it('is a no-op when no orphans exist', () => {
    const db = openDatabase(dbPath)
    try {
      // No open_turns — should not throw
      expect(() => recoverOrphans(db, 'empty-sess')).not.toThrow()

      // No turn_end events created
      const turnEnds = db.query("SELECT * FROM events WHERE event_type = 'turn_end'").all()
      expect(turnEnds).toHaveLength(0)
    } finally {
      closeDatabase(db)
    }
  })

  it('never throws on any input (never-throws contract)', () => {
    const db = openDatabase(dbPath)
    try {
      expect(() => recoverOrphans(db, '')).not.toThrow()
      expect(() => recoverOrphans(db, 'nonexistent')).not.toThrow()
    } finally {
      closeDatabase(db)
    }
  })
})

// ── REC-02: sweepStale ───────────────────────────────────────────────────

describe('sweepStale — stale sweep at CLI/desktop launch (REC-02)', () => {
  it('creates synthetic turn_end for stale open_turns with meta.reason="stale_sweep"', () => {
    const db = openDatabase(dbPath)
    try {
      // Insert a turn_start with an old timestamp (beyond STALE_TURN_MAX_AGE)
      const oldTs = Math.floor(Date.now() / 1000) - STALE_TURN_MAX_AGE - 100
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'stale-1', ts: oldTs }))

      expect(queryOpenTurns(db)).toHaveLength(1)

      sweepStale(db)

      expect(queryOpenTurns(db)).toHaveLength(0)

      const rows = db.query("SELECT * FROM events WHERE event_type = 'turn_end' AND turn_id = 'stale-1'").all() as Array<Record<string, unknown>>
      expect(rows).toHaveLength(1)
      const meta = JSON.parse(rows[0].meta as string)
      expect(meta.reason).toBe('stale_sweep')
    } finally {
      closeDatabase(db)
    }
  })

  it('sets duration_sec=null for stale turns', () => {
    const db = openDatabase(dbPath)
    try {
      const oldTs = Math.floor(Date.now() / 1000) - STALE_TURN_MAX_AGE - 100
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'stale-1', ts: oldTs }))

      sweepStale(db)

      const rows = db.query("SELECT duration_sec FROM events WHERE event_type = 'turn_end'").all() as Array<{ duration_sec: number | null }>
      expect(rows).toHaveLength(1)
      expect(rows[0].duration_sec).toBeNull()
    } finally {
      closeDatabase(db)
    }
  })

  it('does NOT sweep fresh open_turns (within STALE_TURN_MAX_AGE)', () => {
    const db = openDatabase(dbPath)
    try {
      // Insert a fresh turn — timestamp is recent
      const freshTs = Math.floor(Date.now() / 1000) - 60 // 1 minute ago
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'fresh-1', ts: freshTs }))

      sweepStale(db)

      // Fresh turn should NOT be swept
      expect(queryOpenTurns(db)).toHaveLength(1)

      const turnEnds = db.query("SELECT * FROM events WHERE event_type = 'turn_end'").all()
      expect(turnEnds).toHaveLength(0)
    } finally {
      closeDatabase(db)
    }
  })

  it('sweeps stale but keeps fresh open_turns', () => {
    const db = openDatabase(dbPath)
    try {
      const oldTs = Math.floor(Date.now() / 1000) - STALE_TURN_MAX_AGE - 100
      const freshTs = Math.floor(Date.now() / 1000) - 60

      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'stale-1', ts: oldTs }))
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'fresh-1', ts: freshTs }))

      expect(queryOpenTurns(db)).toHaveLength(2)

      sweepStale(db)

      // Only stale turn should be swept
      const remaining = queryOpenTurns(db)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].turn_id).toBe('fresh-1')

      const turnEnds = db.query("SELECT * FROM events WHERE event_type = 'turn_end'").all()
      expect(turnEnds).toHaveLength(1)
    } finally {
      closeDatabase(db)
    }
  })

  it('is a no-op when no open_turns exist', () => {
    const db = openDatabase(dbPath)
    try {
      expect(() => sweepStale(db)).not.toThrow()

      const turnEnds = db.query("SELECT * FROM events WHERE event_type = 'turn_end'").all()
      expect(turnEnds).toHaveLength(0)
    } finally {
      closeDatabase(db)
    }
  })

  it('never throws on any input (never-throws contract)', () => {
    const db = openDatabase(dbPath)
    try {
      expect(() => sweepStale(db)).not.toThrow()
    } finally {
      closeDatabase(db)
    }
  })

  it('sweeps multiple stale turns across different sessions', () => {
    const db = openDatabase(dbPath)
    try {
      const oldTs = Math.floor(Date.now() / 1000) - STALE_TURN_MAX_AGE - 100
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 's1', session_id: 'a', ts: oldTs }))
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 's2', session_id: 'b', ts: oldTs }))

      sweepStale(db)

      expect(queryOpenTurns(db)).toHaveLength(0)
      const turnEnds = db.query("SELECT * FROM events WHERE event_type = 'turn_end'").all()
      expect(turnEnds).toHaveLength(2)
    } finally {
      closeDatabase(db)
    }
  })
})
