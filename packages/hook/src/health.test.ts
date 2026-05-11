import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readHookHealth, recordPersistFailure, recordPersistSuccess } from './health.js'

let tempHome: string
let origHome: string | undefined

beforeEach(() => {
  origHome = process.env.HOME
  tempHome = mkdtempSync(join(tmpdir(), 'vibetime-health-test-'))
  process.env.HOME = tempHome
})

afterEach(() => {
  if (origHome !== undefined) {
    process.env.HOME = origHome
  }
  rmSync(tempHome, { recursive: true, force: true })
})

function healthPath(): string {
  return join(tempHome, '.vibetime', 'hook-health.json')
}

describe('recordPersistFailure', () => {
  it('writes a health file with the failure details', () => {
    recordPersistFailure({
      message: 'database is locked',
      agent: 'claude-code',
      event_type: 'turn_end',
      now: 1_700_000_000,
    })

    const state = readHookHealth()
    expect(state.consecutiveFailures).toBe(1)
    expect(state.lastError?.message).toBe('database is locked')
    expect(state.lastError?.agent).toBe('claude-code')
    expect(state.recentFailures).toHaveLength(1)
  })

  it('increments consecutiveFailures across multiple failures', () => {
    recordPersistFailure({ message: 'a', agent: 'codex', event_type: 'turn_end', now: 1_000 })
    recordPersistFailure({ message: 'b', agent: 'codex', event_type: 'turn_end', now: 1_010 })
    recordPersistFailure({ message: 'c', agent: 'codex', event_type: 'turn_end', now: 1_020 })

    const state = readHookHealth()
    expect(state.consecutiveFailures).toBe(3)
    expect(state.lastError?.message).toBe('c')
    expect(state.recentFailures.map((f) => f.message)).toEqual(['a', 'b', 'c'])
  })

  it('drops failures older than 24h from the recent window', () => {
    recordPersistFailure({
      message: 'old',
      agent: 'codex',
      event_type: 'turn_end',
      now: 1_000_000,
    })
    // 25 hours later — old failure should age out.
    recordPersistFailure({
      message: 'new',
      agent: 'codex',
      event_type: 'turn_end',
      now: 1_000_000 + 25 * 3600,
    })

    const state = readHookHealth()
    expect(state.recentFailures.map((f) => f.message)).toEqual(['new'])
  })

  it('truncates very long error messages', () => {
    const longMessage = 'x'.repeat(2000)
    recordPersistFailure({
      message: longMessage,
      agent: 'codex',
      event_type: 'turn_end',
      now: 1_000,
    })

    const state = readHookHealth()
    expect((state.lastError?.message.length ?? 0) <= 500).toBe(true)
  })

  it('never throws on any input (never-throws contract)', () => {
    expect(() =>
      recordPersistFailure({
        message: 'something',
        agent: 'codex',
        event_type: 'turn_start',
      }),
    ).not.toThrow()
  })
})

describe('recordPersistSuccess', () => {
  it('is a no-op when no health file exists', () => {
    recordPersistSuccess()
    expect(existsSync(healthPath())).toBe(false)
  })

  it('is a no-op when there is no failure streak to clear', () => {
    // Seed a file with 0 consecutive failures.
    recordPersistFailure({ message: 'x', agent: 'codex', event_type: 'turn_end', now: 1_000 })
    recordPersistSuccess() // clears streak → file now has consecutiveFailures: 0
    const before = readHookHealth()

    recordPersistSuccess() // second call should be a no-op
    const after = readHookHealth()

    expect(after).toEqual(before)
  })

  it('clears consecutiveFailures while keeping the recent failures audit trail', () => {
    recordPersistFailure({ message: 'x', agent: 'codex', event_type: 'turn_end', now: 1_000 })
    recordPersistFailure({ message: 'y', agent: 'codex', event_type: 'turn_end', now: 1_010 })

    recordPersistSuccess()

    const state = readHookHealth()
    expect(state.consecutiveFailures).toBe(0)
    expect(state.recentFailures).toHaveLength(2)
    expect(state.lastError?.message).toBe('y')
  })

  it('never throws on any input (never-throws contract)', () => {
    expect(() => recordPersistSuccess()).not.toThrow()
  })
})

describe('readHookHealth', () => {
  it('returns an empty state when the file is missing', () => {
    const state = readHookHealth()
    expect(state).toEqual({ lastError: null, consecutiveFailures: 0, recentFailures: [] })
  })

  it('returns an empty state on corrupt JSON', () => {
    // Seed a real failure first so the .vibetime/ dir + file exist.
    recordPersistFailure({ message: 'x', agent: 'codex', event_type: 'turn_end', now: 1_000 })
    writeFileSync(healthPath(), '{not json')

    const state = readHookHealth()
    expect(state).toEqual({ lastError: null, consecutiveFailures: 0, recentFailures: [] })
  })
})
