// ADPT-04 — seeded property test for the adapters.
// RESEARCH §F (Validation Architecture) + Open Question 3 (mulberry32 seed).
//
// Asserts: any of (UserPromptSubmit / Stop / SessionStart / SessionEnd / '' /
// UnknownEvent) × (200 random mutations of the happy-path fixture) ⇒
// the adapter returns either `null` OR a fully-typed `NormalizedEvent`,
// and never throws. Deterministic via mulberry32 seed=42.
import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '../events.js'
import { adaptClaudeCode } from './claude-code.js'
import { adaptCodex } from './codex.js'
import { adaptCursor } from './cursor.js'
import { adaptGeminiCli } from './gemini-cli.js'

// Tiny seeded PRNG (mulberry32) — reproducible mutation across runs.
// Reference: https://stackoverflow.com/a/47593316 (public domain).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function mutate(rng: () => number, obj: Record<string, unknown>): unknown {
  const r = rng()
  if (r < 0.15) return null
  if (r < 0.25) return undefined
  if (r < 0.32) return 'string-payload'
  if (r < 0.38) return 42
  if (r < 0.42) return []
  const out: Record<string, unknown> = { ...obj }
  const keys = Object.keys(out)
  if (keys.length === 0) return out
  // Delete a random key.
  if (rng() < 0.4) {
    const k = keys[Math.floor(rng() * keys.length)]
    if (k) delete out[k]
  }
  // Corrupt a random key.
  if (rng() < 0.5) {
    const k = keys[Math.floor(rng() * keys.length)]
    if (k) {
      const c = rng()
      out[k] = c < 0.33 ? null : c < 0.66 ? 12345 : []
    }
  }
  return out
}

function isValidEvent(v: unknown): v is NormalizedEvent {
  if (v === null || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return (
    (e.agent === 'claude-code' ||
      e.agent === 'codex' ||
      e.agent === 'cursor' ||
      e.agent === 'gemini-cli') &&
    typeof e.event_type === 'string' &&
    typeof e.project === 'string' &&
    typeof e.session_id === 'string' &&
    typeof e.ts === 'number' &&
    Number.isFinite(e.ts) &&
    e.ts > 0 &&
    typeof e.timezone === 'string' &&
    e.timezone.length > 0
  )
}

const HAPPY_CLAUDE = {
  session_id: 'abc-123',
  cwd: '/Users/barry/x',
  hook_event_name: 'UserPromptSubmit',
  prompt: 'hi',
  permission_mode: 'default',
}
const HAPPY_CODEX = {
  session_id: 'abc-123',
  turn_id: 't-456',
  cwd: '/x',
  hook_event_name: 'UserPromptSubmit',
}
const HAPPY_CURSOR = {
  conversation_id: 'abc-123',
  generation_id: 'g-456',
  hook_event_name: 'beforeSubmitPrompt',
  workspace_roots: ['/x'],
}
const HAPPY_GEMINI = {
  session_id: 'abc-123',
  cwd: '/x',
  hook_event_name: 'BeforeAgent',
  timestamp: '2026-05-09T12:34:56.789Z',
}

const EVENT_NAMES_CLAUDE = [
  'UserPromptSubmit',
  'Stop',
  'SessionStart',
  'SessionEnd',
  '',
  'UnknownEvent',
]
const EVENT_NAMES_CODEX = [
  'UserPromptSubmit',
  'Stop',
  'SessionStart',
  'SessionEnd',
  '',
  'UnknownEvent',
]
const EVENT_NAMES_CURSOR = [
  'beforeSubmitPrompt',
  'stop',
  'sessionStart',
  'sessionEnd',
  '',
  'UnknownEvent',
]
const EVENT_NAMES_GEMINI = [
  'BeforeAgent',
  'BeforeModel',
  'AfterAgent',
  'SessionStart',
  'SessionEnd',
  'UnknownEvent',
]

describe('adapter property tests (mulberry32 seed=42; ADPT-04)', () => {
  it('adaptClaudeCode never throws across 200 mutations × 6 event names', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      for (const name of EVENT_NAMES_CLAUDE) {
        const payload = mutate(rng, HAPPY_CLAUDE)
        let result: NormalizedEvent | null = null
        expect(() => {
          result = adaptClaudeCode(payload, name)
        }).not.toThrow()
        expect(result === null || isValidEvent(result)).toBe(true)
      }
    }
  })

  it('adaptCodex never throws across 200 mutations × 6 event names', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      for (const name of EVENT_NAMES_CODEX) {
        const payload = mutate(rng, HAPPY_CODEX)
        let result: NormalizedEvent | null = null
        expect(() => {
          result = adaptCodex(payload, name)
        }).not.toThrow()
        expect(result === null || isValidEvent(result)).toBe(true)
      }
    }
  })

  it('adaptCursor never throws across 200 mutations × 6 event names', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      for (const name of EVENT_NAMES_CURSOR) {
        const payload = mutate(rng, HAPPY_CURSOR)
        let result: NormalizedEvent | null = null
        expect(() => {
          result = adaptCursor(payload, name)
        }).not.toThrow()
        expect(result === null || isValidEvent(result)).toBe(true)
      }
    }
  })

  it('adaptGeminiCli never throws across 200 mutations × 6 event names', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      for (const name of EVENT_NAMES_GEMINI) {
        const payload = mutate(rng, HAPPY_GEMINI)
        let result: NormalizedEvent | null = null
        expect(() => {
          result = adaptGeminiCli(payload, name)
        }).not.toThrow()
        expect(result === null || isValidEvent(result)).toBe(true)
      }
    }
  })
})
