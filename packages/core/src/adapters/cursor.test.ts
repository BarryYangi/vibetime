// ADPT-03 — adaptCursor tests.
// PRD §8 / DEC-011 / RESEARCH §A.3 / §D / §G.4 / §G.6 / §G.8.
import { describe, expect, it } from 'vitest'
import { adaptCursor } from './cursor.js'

describe('adaptCursor — happy paths (PRD §8 mapping; camelCase event names)', () => {
  it('beforeSubmitPrompt → turn_start; session_id ← conversation_id; turn_id ← generation_id', () => {
    // PRD Appendix verbatim.
    const event = adaptCursor(
      {
        conversation_id: 'abc-123',
        generation_id: 'g-456',
        hook_event_name: 'beforeSubmitPrompt',
        workspace_roots: ['/Users/barry/work/scenee'],
      },
      'beforeSubmitPrompt',
    )
    expect(event).not.toBeNull()
    expect(event?.agent).toBe('cursor')
    expect(event?.event_type).toBe('turn_start')
    expect(event?.project).toBe('/Users/barry/work/scenee')
    expect(event?.session_id).toBe('abc-123')
    expect(event?.turn_id).toBe('g-456')
    expect(typeof event?.ts).toBe('number')
    expect(event?.ts).toBeGreaterThan(0)
    expect(typeof event?.timezone).toBe('string')
    expect(event && 'meta' in event).toBe(false)
  })

  it('stop → turn_end; turn_id from generation_id; meta dropped', () => {
    // PRD Appendix verbatim.
    const event = adaptCursor(
      {
        conversation_id: 'abc-123',
        generation_id: 'g-456',
        status: 'completed',
        hook_event_name: 'stop',
        workspace_roots: ['/Users/barry/work/scenee'],
      },
      'stop',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('turn_end')
    expect(event?.turn_id).toBe('g-456')
    // status is dropped per RESEARCH §G.8.
    expect(event && 'meta' in event).toBe(false)
  })

  it('sessionStart WITH model → meta carries model (present branch)', () => {
    const event = adaptCursor(
      {
        conversation_id: 'abc',
        session_id: 'abc',
        generation_id: 'g-1',
        is_background_agent: false,
        composer_mode: 'agent',
        model: 'claude-3.5-sonnet',
        hook_event_name: 'sessionStart',
        workspace_roots: ['/x'],
      },
      'sessionStart',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('session_start')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.meta).toEqual({ model: 'claude-3.5-sonnet' })
  })

  it('sessionStart WITHOUT model → meta omitted entirely (absent branch per §A.3)', () => {
    const event = adaptCursor(
      {
        conversation_id: 'abc',
        is_background_agent: false,
        hook_event_name: 'sessionStart',
        workspace_roots: ['/x'],
      },
      'sessionStart',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('session_start')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event && 'meta' in event).toBe(false)
  })

  it('sessionEnd → meta carries reason; duration_ms dropped', () => {
    const event = adaptCursor(
      {
        conversation_id: 'abc',
        reason: 'completed',
        duration_ms: 45000,
        hook_event_name: 'sessionEnd',
        workspace_roots: ['/x'],
      },
      'sessionEnd',
    )
    expect(event).not.toBeNull()
    expect(event?.event_type).toBe('session_end')
    expect(event?.meta).toEqual({ reason: 'completed' })
  })
})

describe('adaptCursor — adversarial inputs (RESEARCH §B Tier-2 + §G)', () => {
  it('returns null on unknown event name', () => {
    expect(
      adaptCursor(
        {
          conversation_id: 'abc',
          generation_id: 'g',
          workspace_roots: ['/x'],
        },
        'UnknownCursorEvent',
      ),
    ).toBeNull()
  })

  it('returns null on null payload', () => {
    expect(adaptCursor(null, 'beforeSubmitPrompt')).toBeNull()
  })

  it('returns null on string-primitive payload', () => {
    expect(adaptCursor('string', 'beforeSubmitPrompt')).toBeNull()
  })

  it('returns null when conversation_id is missing', () => {
    expect(
      adaptCursor({ generation_id: 'g', workspace_roots: ['/x'] }, 'beforeSubmitPrompt'),
    ).toBeNull()
  })

  it('returns null when conversation_id is wrong type (null)', () => {
    expect(
      adaptCursor(
        { conversation_id: null, generation_id: 'g', workspace_roots: ['/x'] },
        'beforeSubmitPrompt',
      ),
    ).toBeNull()
  })

  it('workspace_roots empty array → event with project="" (cwd promoted to _unknown by Phase 3 resolveProject)', () => {
    const event = adaptCursor(
      {
        conversation_id: 'abc',
        generation_id: 'g-1',
        hook_event_name: 'beforeSubmitPrompt',
        workspace_roots: [],
      },
      'beforeSubmitPrompt',
    )
    expect(event).not.toBeNull()
    expect(event?.project).toBe('')
    expect(event?.session_id).toBe('abc')
    expect(event?.turn_id).toBe('g-1')
  })

  it('workspace_roots undefined → event with project=""', () => {
    const event = adaptCursor(
      { conversation_id: 'abc', generation_id: 'g-1' },
      'beforeSubmitPrompt',
    )
    expect(event).not.toBeNull()
    expect(event?.project).toBe('')
  })

  it('workspace_roots not-an-array → event with project=""', () => {
    const event = adaptCursor(
      {
        conversation_id: 'abc',
        generation_id: 'g-1',
        workspace_roots: 'not an array',
      },
      'beforeSubmitPrompt',
    )
    expect(event).not.toBeNull()
    expect(event?.project).toBe('')
  })

  it('returns null when generation_id is missing on beforeSubmitPrompt (turn_id required)', () => {
    expect(
      adaptCursor(
        { conversation_id: 'abc', workspace_roots: ['/x'] },
        'beforeSubmitPrompt',
      ),
    ).toBeNull()
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
    expect(() => adaptCursor(evil, 'beforeSubmitPrompt')).not.toThrow()
    expect(adaptCursor(evil, 'beforeSubmitPrompt')).toBeNull()
  })
})
