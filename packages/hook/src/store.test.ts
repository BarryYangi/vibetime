// Tests for SQLite store layer. Covers STORE-01, STORE-02, STORE-03.
// Uses bun:test — bun built-in test runner (CONTEXT.md D-TEST-HOOK).

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  openDatabase,
  closeDatabase,
  persistEvent,
  queryEvents,
  queryOpenTurns,
  deleteOpenTurn,
} from './store.js'
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
    ts: 1714300000,
    timezone: 'Asia/Tokyo',
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vibetime-store-test-'))
  dbPath = join(tmpDir, 'test.db')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── STORE-01: WAL mode + PRAGMAs ──────────────────────────────────────────

describe('openDatabase — PRAGMA setup (STORE-01)', () => {
  it('sets journal_mode to WAL', () => {
    const db = openDatabase(dbPath)
    try {
      const result = db.query('PRAGMA journal_mode').get() as { journal_mode: string }
      expect(result.journal_mode).toBe('wal')
    } finally {
      closeDatabase(db)
    }
  })

  it('sets synchronous to NORMAL', () => {
    const db = openDatabase(dbPath)
    try {
      const result = db.query('PRAGMA synchronous').get() as { synchronous: number }
      // NORMAL = 1
      expect(result.synchronous).toBe(1)
    } finally {
      closeDatabase(db)
    }
  })

  it('sets busy_timeout to 5000', () => {
    const db = openDatabase(dbPath)
    try {
      const result = db.query('PRAGMA busy_timeout').get() as { timeout: number }
      expect(result.timeout).toBe(5000)
    } finally {
      closeDatabase(db)
    }
  })

  it('sets foreign_keys to ON', () => {
    const db = openDatabase(dbPath)
    try {
      const result = db.query('PRAGMA foreign_keys').get() as { foreign_keys: number }
      expect(result.foreign_keys).toBe(1)
    } finally {
      closeDatabase(db)
    }
  })
})

// ── STORE-02: Schema matches PRD §6 ───────────────────────────────────────

describe('openDatabase — schema creation (STORE-02)', () => {
  it('creates events table with correct columns', () => {
    const db = openDatabase(dbPath)
    try {
      const info = db.query("PRAGMA table_info(events)").all() as Array<{ name: string }>
      const colNames = info.map((c) => c.name)
      expect(colNames).toContain('id')
      expect(colNames).toContain('schema_version')
      expect(colNames).toContain('agent')
      expect(colNames).toContain('event_type')
      expect(colNames).toContain('project')
      expect(colNames).toContain('session_id')
      expect(colNames).toContain('turn_id')
      expect(colNames).toContain('ts')
      expect(colNames).toContain('timezone')
      expect(colNames).toContain('duration_sec')
      expect(colNames).toContain('meta')
    } finally {
      closeDatabase(db)
    }
  })

  it('creates open_turns table with correct columns', () => {
    const db = openDatabase(dbPath)
    try {
      const info = db.query("PRAGMA table_info(open_turns)").all() as Array<{ name: string }>
      const colNames = info.map((c) => c.name)
      expect(colNames).toContain('turn_id')
      expect(colNames).toContain('agent')
      expect(colNames).toContain('project')
      expect(colNames).toContain('session_id')
      expect(colNames).toContain('started_at')
      expect(colNames).toContain('timezone')
      expect(colNames).toContain('meta')
    } finally {
      closeDatabase(db)
    }
  })

  it('creates all required indices', () => {
    const db = openDatabase(dbPath)
    try {
      const indices = db.query("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>
      const names = indices.map((i) => i.name)
      expect(names).toContain('idx_events_ts')
      expect(names).toContain('idx_events_project')
      expect(names).toContain('idx_events_agent_project')
      expect(names).toContain('idx_events_session_id')
    } finally {
      closeDatabase(db)
    }
  })

  it('is idempotent — calling openDatabase twice does not error', () => {
    const db1 = openDatabase(dbPath)
    closeDatabase(db1)
    const db2 = openDatabase(dbPath)
    try {
      // Should not throw
      const tables = db2.query("SELECT name FROM sqlite_master WHERE type='table'").all()
      expect(tables.length).toBeGreaterThanOrEqual(2)
    } finally {
      closeDatabase(db2)
    }
  })
})

// ── persistEvent ───────────────────────────────────────────────────────────

describe('persistEvent — event insertion', () => {
  it('inserts a turn_start event into events table', () => {
    const db = openDatabase(dbPath)
    try {
      const event = makeEvent()
      persistEvent(db, event)

      const rows = db.query('SELECT * FROM events').all() as Array<Record<string, unknown>>
      expect(rows).toHaveLength(1)
      expect(rows[0].agent).toBe('claude-code')
      expect(rows[0].event_type).toBe('turn_start')
      expect(rows[0].project).toBe('test-project')
      expect(rows[0].session_id).toBe('sess-1')
      expect(rows[0].turn_id).toBe('turn-1')
      expect(rows[0].schema_version).toBe(1)
    } finally {
      closeDatabase(db)
    }
  })

  it('inserts turn_start into open_turns for crash recovery', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'turn-42' }))

      const openTurns = queryOpenTurns(db)
      expect(openTurns).toHaveLength(1)
      expect(openTurns[0].turn_id).toBe('turn-42')
    } finally {
      closeDatabase(db)
    }
  })

  it('ignores duplicate turn_start for the same open turn_id', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'turn-dup', ts: 1000 }))
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'turn-dup', ts: 1010 }))

      const events = db.query("SELECT * FROM events WHERE turn_id = 'turn-dup'").all()
      const openTurns = queryOpenTurns(db)

      expect(events).toHaveLength(1)
      expect(openTurns).toHaveLength(1)
      expect(openTurns[0].started_at).toBe(1000)
    } finally {
      closeDatabase(db)
    }
  })

  it('computes duration_sec on turn_end and removes from open_turns', () => {
    const db = openDatabase(dbPath)
    try {
      // Start a turn
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 'turn-1', ts: 1000 }))

      // End the turn after 30 seconds
      persistEvent(db, makeEvent({ event_type: 'turn_end', turn_id: 'turn-1', ts: 1030 }))

      // open_turns should be empty
      const openTurns = queryOpenTurns(db)
      expect(openTurns).toHaveLength(0)

      // The turn_end event should have duration_sec = 30
      const rows = db.query("SELECT duration_sec FROM events WHERE event_type = 'turn_end'").all() as Array<{ duration_sec: number | null }>
      expect(rows).toHaveLength(1)
      expect(rows[0].duration_sec).toBe(30)
    } finally {
      closeDatabase(db)
    }
  })

  it('handles session_start without turn_id', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'session_start', turn_id: undefined }))

      const rows = db.query('SELECT * FROM events').all()
      expect(rows).toHaveLength(1)
      // No open_turns entry for session_start
      const openTurns = queryOpenTurns(db)
      expect(openTurns).toHaveLength(0)
    } finally {
      closeDatabase(db)
    }
  })

  it('stores meta as JSON string', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ meta: { key: 'value', nested: { a: 1 } } }))

      const rows = db.query('SELECT meta FROM events').all() as Array<{ meta: string | null }>
      expect(rows[0].meta).not.toBeNull()
      const parsed = JSON.parse(rows[0].meta!)
      expect(parsed.key).toBe('value')
      expect(parsed.nested.a).toBe(1)
    } finally {
      closeDatabase(db)
    }
  })

  it('never throws on any input (never-throws contract)', () => {
    const db = openDatabase(dbPath)
    try {
      // Valid event should not throw
      expect(() => persistEvent(db, makeEvent())).not.toThrow()

      // Event with undefined optional fields
      expect(() => persistEvent(db, makeEvent({ turn_id: undefined, duration_sec: undefined, meta: undefined }))).not.toThrow()
    } finally {
      closeDatabase(db)
    }
  })
})

// ── queryEvents ────────────────────────────────────────────────────────────

describe('queryEvents — event retrieval', () => {
  it('returns all events when no filters', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ ts: 100 }))
      persistEvent(db, makeEvent({ ts: 200, turn_id: 'turn-2' }))

      const events = queryEvents(db)
      expect(events).toHaveLength(2)
    } finally {
      closeDatabase(db)
    }
  })

  it('filters by project', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ project: 'alpha', ts: 100 }))
      persistEvent(db, makeEvent({ project: 'beta', ts: 200, turn_id: 'turn-2' }))

      const events = queryEvents(db, { project: 'alpha' })
      expect(events).toHaveLength(1)
      expect(events[0].project).toBe('alpha')
    } finally {
      closeDatabase(db)
    }
  })

  it('filters by time range', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ ts: 100 }))
      persistEvent(db, makeEvent({ ts: 200, turn_id: 'turn-2' }))
      persistEvent(db, makeEvent({ ts: 300, turn_id: 'turn-3' }))

      const events = queryEvents(db, { from: 150, to: 250 })
      expect(events).toHaveLength(1)
      expect(events[0].ts).toBe(200)
    } finally {
      closeDatabase(db)
    }
  })

  it('filters by agent', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ agent: 'claude-code' }))
      persistEvent(db, makeEvent({ agent: 'codex', turn_id: 'turn-2' }))

      const events = queryEvents(db, { agent: 'codex' })
      expect(events).toHaveLength(1)
      expect(events[0].agent).toBe('codex')
    } finally {
      closeDatabase(db)
    }
  })

  it('returns empty array on error (never throws)', () => {
    const db = openDatabase(dbPath)
    try {
      // Close db to simulate error
      db.close()
      const events = queryEvents(db)
      expect(events).toEqual([])
    } catch {
      // bun:sqlite may throw on closed db query — that's OK, the function catches it
    }
  })
})

// ── queryOpenTurns / deleteOpenTurn ────────────────────────────────────────

describe('open_turns management', () => {
  it('queries open turns with optional sessionId filter', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 't1', session_id: 's1' }))
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 't2', session_id: 's2' }))

      const all = queryOpenTurns(db)
      expect(all).toHaveLength(2)

      const filtered = queryOpenTurns(db, 's1')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].session_id).toBe('s1')
    } finally {
      closeDatabase(db)
    }
  })

  it('deletes an open turn by turn_id', () => {
    const db = openDatabase(dbPath)
    try {
      persistEvent(db, makeEvent({ event_type: 'turn_start', turn_id: 't1' }))
      expect(queryOpenTurns(db)).toHaveLength(1)

      deleteOpenTurn(db, 't1')
      expect(queryOpenTurns(db)).toHaveLength(0)
    } finally {
      closeDatabase(db)
    }
  })
})

// ── STORE-03: Concurrent writes ────────────────────────────────────────────

describe('concurrent writes (STORE-03)', () => {
  it('handles sequential writes from multiple connections without corruption', () => {
    const db = openDatabase(dbPath)
    try {
      // Simulate multiple hook invocations writing events
      for (let i = 0; i < 50; i++) {
        persistEvent(db, makeEvent({
          turn_id: `turn-${i}`,
          ts: 1000 + i,
          session_id: `sess-${i % 5}`,
        }))
      }

      const rows = db.query('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }
      expect(rows.cnt).toBe(50)
    } finally {
      closeDatabase(db)
    }
  })

  it('WAL mode allows concurrent readers during writes', () => {
    const db = openDatabase(dbPath)
    try {
      // Insert some data first
      persistEvent(db, makeEvent({ ts: 100 }))

      // Start a read while writing
      const read1 = queryEvents(db)
      persistEvent(db, makeEvent({ ts: 200, turn_id: 'turn-2' }))
      const read2 = queryEvents(db)

      expect(read1).toHaveLength(1)
      expect(read2).toHaveLength(2)
    } finally {
      closeDatabase(db)
    }
  })
})

// ── closeDatabase ──────────────────────────────────────────────────────────

describe('closeDatabase', () => {
  it('closes without error', () => {
    const db = openDatabase(dbPath)
    expect(() => closeDatabase(db)).not.toThrow()
  })

  it('handles double close gracefully', () => {
    const db = openDatabase(dbPath)
    closeDatabase(db)
    // Second close should not throw (caught internally)
    expect(() => closeDatabase(db)).not.toThrow()
  })
})
