// ADPT-01 — adaptClaudeCode tests.
// PRD §8 / DEC-011 / RESEARCH §A.1 / §G.1 / §G.6 / §G.7.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adaptClaudeCode } from './claude-code.js'

describe('adaptClaudeCode — happy paths (PRD §8 mapping)', () => {
  it('UserPromptSubmit → turn_start with derived turn_id', () => {
    const event = adaptClaudeCode(
      {
        session_id: 'abc-123',
        cwd: '/Users/barry/work/scenee',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'fix the bug in foo.ts',
        permission_mode: 'default',
      },
      'UserPromptSubmit',
    )
    expect(event).not.toBeNull()
    expect(event?.agent).toBe('claude-code')
    expect(event?.event_type).toBe('turn_start')
    expect(event?.project).toBe('/Users/barry/work/scenee')
    expect(event?.session_id).toBe('abc-123')
    expect(event?.turn_id).toMatch(/^abc-123-\d+(\.\d+)?$/)
    expect(typeof event?.ts).toBe('number')
    expect(event?.ts).toBeGreaterThan(0)
    expect(typeof event?.timezone).toBe('string')
    expect(event?.timezone.length).toBeGreaterThan(0)
    // V0 meta whitelist drops `prompt` / `permission_mode`.
    expect(event && 'meta' in event).toBe(false)
  })

  it('Stop → turn_end with derived turn_id; meta dropped', () => {
    const event = adaptClaudeCode(
      {
        session_id: 'abc-123',
        cwd: '/x',
        hook_event_name: 'Stop',
        stop_reason: 'end_turn',
      },
      'Stop',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('turn_end')
    expect(event?.turn_id).toMatch(/^abc-123-\d+(\.\d+)?$/)
    expect(event && 'meta' in event).toBe(false)
  })

  it('SessionStart → session_start with model + source meta; no turn_id key', () => {
    const event = adaptClaudeCode(
      {
        session_id: 'abc-123',
        cwd: '/x',
        hook_event_name: 'SessionStart',
        source: 'startup',
        model: 'claude-sonnet-4-6',
      },
      'SessionStart',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('session_start')
    // turn_id MUST be omitted (not present as a key) on session_* events.
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.meta).toEqual({ model: 'claude-sonnet-4-6', source: 'startup' })
  })

  it('SessionEnd → session_end with reason meta; no turn_id key', () => {
    const event = adaptClaudeCode(
      {
        session_id: 'abc-123',
        cwd: '/x',
        hook_event_name: 'SessionEnd',
        reason: 'clear',
      },
      'SessionEnd',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('session_end')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.meta).toEqual({ reason: 'clear' })
  })
})

describe('adaptClaudeCode — adversarial inputs (RESEARCH §B Tier-2 + §G)', () => {
  const happy = {
    session_id: 'abc',
    cwd: '/x',
    hook_event_name: 'UserPromptSubmit',
  }

  it('returns null on empty event name', () => {
    expect(adaptClaudeCode(happy, '')).toBeNull()
  })

  it('returns null on unknown event name (PostToolBatch is real but unmapped)', () => {
    expect(adaptClaudeCode(happy, 'PostToolBatch')).toBeNull()
  })

  it('returns null on null payload', () => {
    expect(adaptClaudeCode(null, 'UserPromptSubmit')).toBeNull()
  })

  it('returns null on undefined payload', () => {
    expect(adaptClaudeCode(undefined, 'UserPromptSubmit')).toBeNull()
  })

  it('returns null on string-primitive payload', () => {
    expect(adaptClaudeCode('not an object', 'UserPromptSubmit')).toBeNull()
  })

  it('returns null when session_id is wrong type', () => {
    expect(adaptClaudeCode({ session_id: 42, cwd: '/x' }, 'UserPromptSubmit')).toBeNull()
  })

  it('returns null when cwd is missing', () => {
    expect(adaptClaudeCode({ session_id: 'abc' }, 'UserPromptSubmit')).toBeNull()
  })

  it('returns null on Proxy that throws on every getter (belt-and-braces)', () => {
    const evil = new Proxy(
      {},
      {
        get() {
          throw new Error('boom')
        },
        has() {
          return true
        },
      },
    )
    expect(() => adaptClaudeCode(evil, 'UserPromptSubmit')).not.toThrow()
    expect(adaptClaudeCode(evil, 'UserPromptSubmit')).toBeNull()
  })
})

describe('adaptClaudeCode — turn_id derivation (PRD §8 + RESEARCH §G.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('derives turn_id from session_id and timestamp with sub-second precision', () => {
    const event = adaptClaudeCode(
      { session_id: 'sid', cwd: '/x', hook_event_name: 'UserPromptSubmit' },
      'UserPromptSubmit',
    )
    // 2026-04-28T12:00:00Z = 1777377600 epoch seconds (verified via
    // `Date.parse('2026-04-28T12:00:00Z') / 1000`). Plan 02-01 example
    // value 1761739200 was for a different date and 1777723200 was an
    // arithmetic slip in the planning notes — the assertion below uses
    // the actually-computed epoch.
    expect(event?.turn_id).toMatch(/^sid-1777377600(\.0+)?$/)
  })

  it('two calls 1ms apart produce distinct turn_ids (collision-resistance)', () => {
    const payload = { session_id: 'sid', cwd: '/x', hook_event_name: 'UserPromptSubmit' }
    const first = adaptClaudeCode(payload, 'UserPromptSubmit')
    vi.advanceTimersByTime(1)
    const second = adaptClaudeCode(payload, 'UserPromptSubmit')
    expect(first?.turn_id).toBeDefined()
    expect(second?.turn_id).toBeDefined()
    expect(first?.turn_id).not.toBe(second?.turn_id)
  })
})
