// Tests for hook mode main logic. Covers HOOK-02, HOOK-04.
// Uses bun:test — bun built-in test runner (CONTEXT.md D-TEST-HOOK).

import { describe, expect, it } from 'bun:test'
import { detectAgent, normalizeProjectCwd, resolveHookProject } from './hook.js'

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

  it('returns gemini-cli for --source gemini-cli', () => {
    const result = detectAgent({}, ['node', 'hook', '--source', 'gemini-cli'])
    expect(result).toBe('gemini-cli')
  })

  it('is case-insensitive for --source', () => {
    expect(detectAgent({}, ['node', 'hook', '--source', 'CLAUDE'])).toBe('claude-code')
    expect(detectAgent({}, ['node', 'hook', '--source', 'CODEX'])).toBe('codex')
    expect(detectAgent({}, ['node', 'hook', '--source', 'CURSOR'])).toBe('cursor')
    expect(detectAgent({}, ['node', 'hook', '--source', 'GEMINI'])).toBe('gemini-cli')
  })

  it('--source takes priority over event name', () => {
    // Payload has Cursor event name, but --source says claude
    const result = detectAgent({ hook_event_name: 'beforeSubmitPrompt' }, [
      'node',
      'hook',
      '--source',
      'claude',
    ])
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

  it('detects gemini-cli from BeforeAgent', () => {
    expect(detectAgent({ hook_event_name: 'BeforeAgent' }, [])).toBe('gemini-cli')
  })

  it('detects gemini-cli from BeforeModel', () => {
    expect(detectAgent({ hook_event_name: 'BeforeModel' }, [])).toBe('gemini-cli')
  })

  it('detects gemini-cli from AfterAgent', () => {
    expect(detectAgent({ hook_event_name: 'AfterAgent' }, [])).toBe('gemini-cli')
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
      expect(
        result === null || ['claude-code', 'codex', 'cursor', 'gemini-cli'].includes(result),
      ).toBe(true)
    })
  }
})

// ── project resolution — cwd normalization ────────────────────────────────

describe('normalizeProjectCwd', () => {
  it('uses process cwd when agent reports only the current directory basename', () => {
    expect(normalizeProjectCwd('vibetime', '/Users/barry/Documents/Project/i/vibetime')).toBe(
      '/Users/barry/Documents/Project/i/vibetime',
    )
  })

  it('resolves relative subdirectories against the hook process cwd', () => {
    expect(normalizeProjectCwd('packages/hook', '/Users/barry/Documents/Project/i/vibetime')).toBe(
      '/Users/barry/Documents/Project/i/vibetime/packages/hook',
    )
  })
})

describe('resolveHookProject', () => {
  it('uses the current git worktree when Codex reports only a bare project name', () => {
    const result = resolveHookProject({
      rawCwd: 'vibetime',
      currentCwd: '/Users/barry/Documents/Project/i/vibetime',
      readGitRemoteUrl: (cwd) =>
        cwd === '/Users/barry/Documents/Project/i/vibetime'
          ? 'https://github.com/BarryYangi/vibetime.git'
          : null,
    })

    expect(result).toBe('BarryYangi/vibetime')
  })

  it('keeps the normalized basename as fallback when a path has no remote', () => {
    const result = resolveHookProject({
      rawCwd: 'packages/hook',
      currentCwd: '/Users/barry/Documents/Project/i/vibetime',
      readGitRemoteUrl: () => null,
    })

    expect(result).toBe('hook')
  })
})
