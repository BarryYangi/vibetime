// Tests for hook mode main logic. Covers HOOK-02, HOOK-04.
// Uses bun:test — bun built-in test runner (CONTEXT.md D-TEST-HOOK).

import { describe, expect, it } from 'bun:test'
import { detectAgent } from './hook.js'
import type { Agent } from '@vibetime/core'

// ── detectAgent — --source argument ───────────────────────────────────────

describe('detectAgent — --source argument', () => {
  it('returns claude-code for --source claude', () => {
    const result = detectAgent({}, ['node', 'hook', '--source', 'claude'])
    expect(result).toBe('claude-code')
  })

  it('returns claude-code for --source claude-code', () => {
    const result = detectAgent({}, ['node', 'hook', '--source', 'claude-code'])
    expect(result).toBe('claude-code')
  })

  it('returns codex for --source codex', () => {
    const result = detectAgent({}, ['node', 'hook', '--source', 'codex'])
    expect(result).toBe('codex')
  })

  it('returns cursor for --source cursor', () => {
    const result = detectAgent({}, ['node', 'hook', '--source', 'cursor'])
    expect(result).toBe('cursor')
  })

  it('is case-insensitive for --source', () => {
    expect(detectAgent({}, ['node', 'hook', '--source', 'CLAUDE'])).toBe('claude-code')
    expect(detectAgent({}, ['node', 'hook', '--source', 'CODEX'])).toBe('codex')
    expect(detectAgent({}, ['node', 'hook', '--source', 'CURSOR'])).toBe('cursor')
  })

  it('--source takes priority over event name', () => {
    // Payload has Cursor event name, but --source says claude
    const result = detectAgent(
      { hook_event_name: 'beforeSubmitPrompt' },
      ['node', 'hook', '--source', 'claude'],
    )
    expect(result).toBe('claude-code')
  })
})

// ── detectAgent — event name matching ─────────────────────────────────────

describe('detectAgent — event name matching', () => {
  it('detects claude-code from UserPromptSubmit', () => {
    expect(detectAgent({ hook_event_name: 'UserPromptSubmit' }, [])).toBe('claude-code')
  })

  it('detects claude-code from Stop', () => {
    expect(detectAgent({ hook_event_name: 'Stop' }, [])).toBe('claude-code')
  })

  it('detects claude-code from SessionStart', () => {
    expect(detectAgent({ hook_event_name: 'SessionStart' }, [])).toBe('claude-code')
  })

  it('detects claude-code from SessionEnd', () => {
    expect(detectAgent({ hook_event_name: 'SessionEnd' }, [])).toBe('claude-code')
  })

  it('detects codex from UserPromptSubmit (when no --source)', () => {
    // Codex and Claude Code share event names — Claude Code takes priority in our mapping
    // This is expected: without --source, ambiguous events default to claude-code
    expect(detectAgent({ hook_event_name: 'UserPromptSubmit' }, [])).toBe('claude-code')
  })

  it('detects cursor from beforeSubmitPrompt', () => {
    expect(detectAgent({ hook_event_name: 'beforeSubmitPrompt' }, [])).toBe('cursor')
  })

  it('detects cursor from stop (lowercase)', () => {
    expect(detectAgent({ hook_event_name: 'stop' }, [])).toBe('cursor')
  })

  it('detects cursor from sessionStart (camelCase)', () => {
    expect(detectAgent({ hook_event_name: 'sessionStart' }, [])).toBe('cursor')
  })

  it('detects cursor from sessionEnd (camelCase)', () => {
    expect(detectAgent({ hook_event_name: 'sessionEnd' }, [])).toBe('cursor')
  })

  it('checks event field as fallback for hook_event_name', () => {
    expect(detectAgent({ event: 'beforeSubmitPrompt' }, [])).toBe('cursor')
    expect(detectAgent({ event: 'UserPromptSubmit' }, [])).toBe('claude-code')
  })
})

// ── detectAgent — unknown / edge cases ────────────────────────────────────

describe('detectAgent — unknown and edge cases', () => {
  it('returns null for unknown event name', () => {
    expect(detectAgent({ hook_event_name: 'UnknownEvent' }, [])).toBeNull()
  })

  it('returns null for empty payload', () => {
    expect(detectAgent({}, [])).toBeNull()
  })

  it('returns null for null payload fields', () => {
    expect(detectAgent({ hook_event_name: null }, [])).toBeNull()
  })

  it('returns null for numeric event name', () => {
    expect(detectAgent({ hook_event_name: 42 }, [])).toBeNull()
  })

  it('returns null when --source has no value (last arg)', () => {
    expect(detectAgent({}, ['node', 'hook', '--source'])).toBeNull()
  })

  it('returns null for unrecognized --source value', () => {
    // Falls through to event name matching, which also fails
    expect(detectAgent({}, ['node', 'hook', '--source', 'unknown'])).toBeNull()
  })
})

// ── detectAgent — property: total function ────────────────────────────────

describe('detectAgent — property: never throws', () => {
  const inputs: Array<[Record<string, unknown>, string[]]> = [
    [{}, []],
    [{ hook_event_name: 'UserPromptSubmit' }, []],
    [{ event: 'stop' }, ['node', 'hook', '--source', 'cursor']],
    [{ hook_event_name: '' }, []],
    [{ hook_event_name: undefined }, []],
    [{ random_field: true }, ['node', 'hook']],
  ]

  for (const [payload, argv] of inputs) {
    it(`never throws for payload=${JSON.stringify(payload)}, argv=${JSON.stringify(argv)}`, () => {
      expect(() => detectAgent(payload, argv)).not.toThrow()
      const result = detectAgent(payload, argv)
      // Result is either Agent or null
      expect(result === null || ['claude-code', 'codex', 'cursor'].includes(result)).toBe(true)
    })
  }
})
