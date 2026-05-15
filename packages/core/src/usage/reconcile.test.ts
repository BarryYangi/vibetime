import { describe, expect, it } from 'vitest'
import { HOOK_USAGE_EVENTS } from './__fixtures__/hook-events.js'
import { reconcileUsageWithHookEvents } from './reconcile.js'
import type { UsageRecordFact, UsageTokenBreakdown } from './types.js'

const baseTokens: UsageTokenBreakdown = {
  inputTokens: 100,
  cachedInputTokens: 10,
  cacheCreationInputTokens: 0,
  outputTokens: 20,
  reasoningOutputTokens: 5,
  totalTokens: 135,
}

function record(overrides: Partial<UsageRecordFact>): UsageRecordFact {
  return {
    agent: 'codex',
    sourceFileKey: 'fixture.jsonl',
    sourceFileBasename: 'fixture.jsonl',
    sourceRowKey: `row-${Math.random()}`,
    sessionId: 'session',
    turnId: null,
    project: null,
    ts: 1778806812,
    model: 'gpt-5-codex',
    tokens: baseTokens,
    attributionMethod: 'unmatched',
    attributionConfidence: 0,
    meta: { sourceKind: 'test' },
    ...overrides,
  }
}

describe('reconcileUsageWithHookEvents', () => {
  it('attributes usage by turn_id before any wider fallback', () => {
    const [attributed] = reconcileUsageWithHookEvents(
      [
        record({
          agent: 'codex',
          sessionId: 'codex-session-1',
          turnId: 'codex-turn-1',
          ts: 1778806812,
        }),
      ],
      HOOK_USAGE_EVENTS,
    )

    expect(attributed).toMatchObject({
      project: 'vibetime',
      sessionId: 'codex-session-1',
      turnId: 'codex-turn-1',
      attributionMethod: 'turn_id',
      attributionConfidence: 1,
    })
  })

  it('falls back to session_time_window for rows without a turn id', () => {
    const [attributed] = reconcileUsageWithHookEvents(
      [
        record({
          agent: 'claude-code',
          sessionId: 'claude-session-1',
          turnId: null,
          ts: 1778814000,
          model: 'claude-sonnet-4-5',
        }),
      ],
      HOOK_USAGE_EVENTS,
    )

    expect(attributed).toMatchObject({
      project: 'vibetime',
      sessionId: 'claude-session-1',
      turnId: 'claude-turn-window',
      attributionMethod: 'session_time_window',
      attributionConfidence: 0.8,
    })
  })

  it('falls back to project_time_window when only project context is available', () => {
    const [attributed] = reconcileUsageWithHookEvents(
      [
        record({
          agent: 'claude-code',
          sessionId: 'different-session',
          turnId: null,
          project: 'fallback-project',
          ts: 1778814550,
          model: 'claude-sonnet-4-5',
        }),
      ],
      HOOK_USAGE_EVENTS,
    )

    expect(attributed).toMatchObject({
      project: 'fallback-project',
      sessionId: 'claude-session-project-fallback',
      attributionMethod: 'project_time_window',
      attributionConfidence: 0.5,
    })
  })

  it('preserves unmatched usage rows with null project and zero confidence', () => {
    const [attributed] = reconcileUsageWithHookEvents(
      [
        record({
          agent: 'codex',
          sessionId: 'no-hook-session',
          turnId: 'no-hook-turn',
          project: 'not-real',
          ts: 1778800000,
        }),
      ],
      HOOK_USAGE_EVENTS,
    )

    expect(attributed).toMatchObject({
      project: null,
      attributionMethod: 'unmatched',
      attributionConfidence: 0,
    })
  })
})
