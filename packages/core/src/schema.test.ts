import { describe, expect, it } from 'vitest'
import type { AdapterFn, Agent, EventType, NormalizedEvent } from './events.js'
import { DDL_EVENTS, DDL_INDICES, DDL_OPEN_TURNS, SCHEMA_VERSION } from './schema.js'

describe('SCHEMA_VERSION', () => {
  it('is the literal 1', () => {
    expect(SCHEMA_VERSION).toBe(1)
    const _check: 1 = SCHEMA_VERSION
    void _check
  })
})

describe('DDL_EVENTS (byte-exact PRD §6 — no IF NOT EXISTS)', () => {
  it('starts with the verbatim PRD §6 prefix `CREATE TABLE events (`', () => {
    // FND-03: PRD §6 says `CREATE TABLE events (`. No IF NOT EXISTS, no other
    // clauses. The Phase 3 store init layer handles idempotency separately.
    expect(DDL_EVENTS).toMatch(/^\s*CREATE TABLE events \(/)
    expect(DDL_EVENTS).not.toContain('IF NOT EXISTS')
  })

  it('declares every column from CON-schema-events-table verbatim', () => {
    expect(DDL_EVENTS).toContain('id              INTEGER PRIMARY KEY AUTOINCREMENT')
    expect(DDL_EVENTS).toContain('schema_version  INTEGER NOT NULL DEFAULT 1')
    expect(DDL_EVENTS).toContain('agent           TEXT    NOT NULL')
    expect(DDL_EVENTS).toContain('event_type      TEXT    NOT NULL')
    expect(DDL_EVENTS).toContain('project         TEXT    NOT NULL')
    expect(DDL_EVENTS).toContain('session_id      TEXT    NOT NULL')
    expect(DDL_EVENTS).toContain('turn_id         TEXT')
    expect(DDL_EVENTS).toContain('ts              REAL    NOT NULL')
    expect(DDL_EVENTS).toContain('timezone        TEXT    NOT NULL')
    expect(DDL_EVENTS).toContain('duration_sec    REAL')
    expect(DDL_EVENTS).toContain('meta            TEXT')
  })
})

describe('DDL_OPEN_TURNS (byte-exact PRD §6 — no IF NOT EXISTS)', () => {
  it('starts with the verbatim PRD §6 prefix `CREATE TABLE open_turns (`', () => {
    expect(DDL_OPEN_TURNS).toMatch(/^\s*CREATE TABLE open_turns \(/)
    expect(DDL_OPEN_TURNS).not.toContain('IF NOT EXISTS')
  })

  it('declares every column from CON-schema-open-turns-table verbatim', () => {
    expect(DDL_OPEN_TURNS).toContain('turn_id     TEXT    PRIMARY KEY')
    expect(DDL_OPEN_TURNS).toContain('agent       TEXT    NOT NULL')
    expect(DDL_OPEN_TURNS).toContain('project     TEXT    NOT NULL')
    expect(DDL_OPEN_TURNS).toContain('session_id  TEXT    NOT NULL')
    expect(DDL_OPEN_TURNS).toContain('started_at  REAL    NOT NULL')
    expect(DDL_OPEN_TURNS).toContain('timezone    TEXT    NOT NULL')
    expect(DDL_OPEN_TURNS).toContain('meta        TEXT')
  })
})

describe('DDL_INDICES', () => {
  it('contains the required indices for hot query paths', () => {
    expect(DDL_INDICES).toHaveLength(5)
    const joined = DDL_INDICES.join('\n')
    expect(joined).toMatch(/idx_events_ts\b.*\bts\b/)
    expect(joined).toMatch(/idx_events_project\b.*\bproject\b/)
    expect(joined).toMatch(/idx_events_agent_project\b.*\bagent,\s*project\b/)
    expect(joined).toMatch(/idx_events_session_id\b.*\bsession_id\b/)
    expect(joined).toMatch(/idx_events_turn_id\b.*\bturn_id\b/)
  })
})

describe('NormalizedEvent + AdapterFn type contracts', () => {
  it('compiles against the locked DEC-011 shape', () => {
    const sample: NormalizedEvent = {
      agent: 'claude-code',
      event_type: 'turn_start',
      project: 'owner/repo',
      session_id: 'session-1',
      turn_id: 'turn-1',
      ts: 1714276800.123,
      timezone: 'America/New_York',
      meta: { whatever: 1 },
    }
    expect(sample.agent).toBe('claude-code')

    const noopAdapter: AdapterFn = (_payload, _event) => null
    expect(noopAdapter({}, 'irrelevant')).toBeNull()

    const agents: Agent[] = ['claude-code', 'codex', 'cursor', 'gemini-cli']
    const events: EventType[] = ['turn_start', 'turn_end', 'session_start', 'session_end']
    expect(agents).toHaveLength(4)
    expect(events).toHaveLength(4)
  })
})
