// ADPT-02 — adaptCodex tests.
// PRD §8 / DEC-011 / RESEARCH §A.2 / §G.5 / §G.6 / §G.8.
import { describe, expect, it } from 'vitest'
import { adaptCodex } from './codex.js'

describe('adaptCodex — happy paths (PRD §8 mapping; only 3 GA events)', () => {
  it('UserPromptSubmit → turn_start with vendor-provided turn_id', () => {
    const event = adaptCodex(
      {
        session_id: 'abc-123',
        turn_id: 't-456',
        cwd: '/Users/barry/work/scenee',
        hook_event_name: 'UserPromptSubmit',
      },
      'UserPromptSubmit',
    )
    expect(event).not.toBeNull()
    expect(event?.agent).toBe('codex')
    expect(event?.event_type).toBe('turn_start')
    expect(event?.project).toBe('/Users/barry/work/scenee')
    expect(event?.session_id).toBe('abc-123')
    // Codex turn_id is vendor-provided, NOT derived.
    expect(event?.turn_id).toBe('t-456')
    expect(typeof event?.ts).toBe('number')
    expect(event?.ts).toBeGreaterThan(0)
    expect(typeof event?.timezone).toBe('string')
    expect(event && 'meta' in event).toBe(false)
  })

  it('Stop → turn_end with vendor-provided turn_id; meta dropped', () => {
    const event = adaptCodex(
      {
        session_id: 'abc',
        turn_id: 't-456',
        cwd: '/x',
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message: '...',
      },
      'Stop',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('turn_end')
    expect(event?.turn_id).toBe('t-456')
    // V0 whitelist drops stop_hook_active and last_assistant_message.
    expect(event && 'meta' in event).toBe(false)
  })

  it('SessionStart → session_start with model + source meta; no turn_id key', () => {
    const event = adaptCodex(
      {
        session_id: 'abc',
        cwd: '/x',
        hook_event_name: 'SessionStart',
        source: 'startup',
        model: 'gpt-5',
      },
      'SessionStart',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('session_start')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.meta).toEqual({ model: 'gpt-5', source: 'startup' })
  })
})

describe('adaptCodex — SessionEnd is banned (RESEARCH §G.5)', () => {
  it('SessionEnd (PascalCase) returns null — Codex does not emit it', () => {
    const event = adaptCodex(
      { session_id: 'abc', cwd: '/x', hook_event_name: 'SessionEnd' },
      'SessionEnd',
    )
    expect(event).toBeNull()
  })

  it('sessionEnd (camelCase variant) also returns null — defensive', () => {
    const event = adaptCodex({ session_id: 'abc', cwd: '/x' }, 'sessionEnd')
    expect(event).toBeNull()
  })
})

describe('adaptCodex — adversarial inputs (RESEARCH §B Tier-2 + §G)', () => {
  const happy = {
    session_id: 'abc',
    turn_id: 't-1',
    cwd: '/x',
    hook_event_name: 'UserPromptSubmit',
  }

  it('returns null on empty event name', () => {
    expect(adaptCodex(happy, '')).toBeNull()
  })

  it('returns null on unmapped Codex event (PostToolUse)', () => {
    expect(adaptCodex(happy, 'PostToolUse')).toBeNull()
  })

  it('returns null on null payload', () => {
    expect(adaptCodex(null, 'UserPromptSubmit')).toBeNull()
  })

  it('returns null on undefined payload', () => {
    expect(adaptCodex(undefined, 'UserPromptSubmit')).toBeNull()
  })

  it('returns null on string-primitive payload', () => {
    expect(adaptCodex('string', 'UserPromptSubmit')).toBeNull()
  })

  it('returns null when session_id is wrong type', () => {
    expect(
      adaptCodex({ session_id: 42, turn_id: 't-1', cwd: '/x' }, 'UserPromptSubmit'),
    ).toBeNull()
  })

  it('returns null when turn_id is missing on UserPromptSubmit (turn events require turn_id)', () => {
    expect(adaptCodex({ session_id: 'abc', cwd: '/x' }, 'UserPromptSubmit')).toBeNull()
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
    expect(() => adaptCodex(evil, 'UserPromptSubmit')).not.toThrow()
    expect(adaptCodex(evil, 'UserPromptSubmit')).toBeNull()
  })
})
