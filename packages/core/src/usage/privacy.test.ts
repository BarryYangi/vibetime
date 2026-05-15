import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DDL_USAGE_PRICING_CACHE,
  DDL_USAGE_RECORDS,
  DDL_USAGE_SCAN_STATE,
} from '../schema.js'
import {
  USAGE_AGENTS,
  isUsageAgent,
  isUsageRefreshFrequency,
  sanitizeUsageMeta,
  type UsagePricingEntry,
  type UsageRecordFact,
  type UsageScanState,
} from './types.js'

const FORBIDDEN_PERSISTENCE_KEYS = [
  'prompt',
  'response',
  'tool_args',
  'arguments',
  'content',
  'rawTranscript',
  'transcript_line',
] as const

const PRIVACY_CANARIES = [
  'SECRET_PROMPT_CANARY',
  'SECRET_RESPONSE_CANARY',
  'SECRET_TOOL_ARG_CANARY',
] as const

function privacyCanaryFixture(): string {
  return readFileSync(new URL('./__fixtures__/claude-privacy-canary.jsonl', import.meta.url), 'utf8')
}

describe('usage persistence privacy', () => {
  it('does not expose content-bearing fields in usage ddl', () => {
    const ddl = [DDL_USAGE_RECORDS, DDL_USAGE_SCAN_STATE, DDL_USAGE_PRICING_CACHE].join('\n')

    for (const key of FORBIDDEN_PERSISTENCE_KEYS) {
      expect(ddl).not.toContain(key)
    }
  })

  it('keeps usage agents limited to claude code and codex', () => {
    expect(USAGE_AGENTS).toEqual(['claude-code', 'codex'])
    expect(isUsageAgent('claude-code')).toBe(true)
    expect(isUsageAgent('codex')).toBe(true)
    expect(isUsageAgent('cursor')).toBe(false)
    expect(isUsageRefreshFrequency('30m')).toBe(true)
    expect(isUsageRefreshFrequency('2h')).toBe(false)
  })

  it('rejects privacy canaries from persistable usage metadata', () => {
    const fixture = privacyCanaryFixture()
    for (const canary of PRIVACY_CANARIES) {
      expect(fixture).toContain(canary)
    }

    const record: UsageRecordFact = {
      agent: 'claude-code',
      sourceFileKey: 'claude/projects/vibetime/session.jsonl',
      sourceRowKey: 'claude-privacy-session:req-privacy-1:msg-privacy-1',
      sourceFileBasename: 'session.jsonl',
      sessionId: 'claude-privacy-session',
      turnId: null,
      project: 'vibetime',
      ts: 1778817608,
      model: 'claude-sonnet-4-5',
      tokens: {
        inputTokens: 42,
        cachedInputTokens: 0,
        cacheCreationInputTokens: 0,
        outputTokens: 7,
        reasoningOutputTokens: 0,
        totalTokens: 49,
      },
      attributionMethod: 'unmatched',
      attributionConfidence: 0,
      meta: sanitizeUsageMeta({
        isSidechain: false,
        subagentType: 'main',
        attributionReason: 'fixture',
        sourceKind: 'claude-assistant-usage',
        prompt: 'SECRET_PROMPT_CANARY',
        response: 'SECRET_RESPONSE_CANARY',
        tool_args: 'SECRET_TOOL_ARG_CANARY',
      }),
    }

    const scanState: UsageScanState = {
      agent: 'claude-code',
      sourceFileKey: 'claude/projects/vibetime/session.jsonl',
      sourceFileBasename: 'session.jsonl',
      mtimeMs: 1778817608000,
      sizeBytes: fixture.length,
      lastScannedAt: 1778817610,
      lastRowKey: record.sourceRowKey,
    }

    const pricing: UsagePricingEntry = {
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      inputUsdPerMillion: 3,
      cachedInputUsdPerMillion: 0.3,
      cacheCreationInputUsdPerMillion: 3.75,
      outputUsdPerMillion: 15,
      reasoningOutputUsdPerMillion: null,
      source: 'litellm-model-prices-and-context-window',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      rawVersion: '2026-05-15-fixture',
    }

    const serialized = JSON.stringify({ record, scanState, pricing })

    for (const canary of PRIVACY_CANARIES) {
      expect(serialized).not.toContain(canary)
    }
    for (const key of FORBIDDEN_PERSISTENCE_KEYS) {
      expect(serialized).not.toContain(`"${key}"`)
    }
  })
})
