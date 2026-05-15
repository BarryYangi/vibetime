import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildUsageSummary } from './aggregate.js'
import { normalizeLiteLlmPricingPayload } from './pricing.js'
import type { UsageRecordFact, UsageTokenBreakdown } from './types.js'

function pricingFixture(): unknown {
  return JSON.parse(
    readFileSync(new URL('./__fixtures__/pricing-cache.json', import.meta.url), 'utf8'),
  )
}

function tokens(overrides: Partial<UsageTokenBreakdown>): UsageTokenBreakdown {
  const result = {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    ...overrides,
  }
  return result
}

function record(overrides: Partial<UsageRecordFact>): UsageRecordFact {
  return {
    agent: 'claude-code',
    sourceFileKey: 'fixture.jsonl',
    sourceFileBasename: 'fixture.jsonl',
    sourceRowKey: `row-${Math.random()}`,
    sessionId: 'session',
    turnId: null,
    project: 'vibetime',
    ts: 1778814000,
    model: 'claude-sonnet-4-5',
    tokens: tokens({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
    attributionMethod: 'turn_id',
    attributionConfidence: 1,
    meta: { sourceKind: 'test' },
    ...overrides,
  }
}

describe('buildUsageSummary', () => {
  it('filters Cursor and Gemini records while preserving Claude Code and Codex totals', () => {
    const summary = buildUsageSummary(
      [
        record({ agent: 'claude-code', tokens: tokens({ inputTokens: 100, totalTokens: 100 }) }),
        record({
          agent: 'codex',
          model: 'gpt-5-codex',
          tokens: tokens({ inputTokens: 200, totalTokens: 200 }),
        }),
        record({
          agent: 'cursor',
          tokens: tokens({ inputTokens: 999, totalTokens: 999 }),
        } as never),
        record({
          agent: 'gemini',
          tokens: tokens({ inputTokens: 999, totalTokens: 999 }),
        } as never),
      ],
      {
        periodDays: 7,
        now: new Date('2026-05-15T12:00:00.000Z'),
        prices: normalizeLiteLlmPricingPayload(pricingFixture(), '2026-05-15T00:00:00.000Z'),
        pricingStatus: 'fresh',
      },
    )

    expect(summary.totals.recordCount).toBe(2)
    expect(summary.totals.totalTokens).toBe(300)
    expect(summary.availableFilters.agents).toEqual(['claude-code', 'codex'])
  })

  it('builds dense daily rows for the selected period', () => {
    const summary = buildUsageSummary([record({ ts: 1778814000 })], {
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
      prices: normalizeLiteLlmPricingPayload(pricingFixture(), '2026-05-15T00:00:00.000Z'),
      pricingStatus: 'fresh',
    })

    expect(summary.daily).toHaveLength(7)
    expect(summary.daily.map((row) => row.date)).toEqual([
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
    ])
    expect(summary.daily.at(-1)).toMatchObject({ totalTokens: 150, recordCount: 1 })
  })

  it('keeps unknown price and Unassigned usage rows visible in audit output', () => {
    const summary = buildUsageSummary(
      [
        record({
          project: null,
          model: 'unknown-future-model',
          tokens: tokens({ inputTokens: 510, outputTokens: 70, totalTokens: 580 }),
          attributionMethod: 'unmatched',
          attributionConfidence: 0,
        }),
      ],
      {
        periodDays: 7,
        now: new Date('2026-05-15T12:00:00.000Z'),
        prices: normalizeLiteLlmPricingPayload(pricingFixture(), '2026-05-15T00:00:00.000Z'),
        pricingStatus: 'fresh',
      },
    )

    expect(summary.totals.estimatedCostUsd).toBeNull()
    expect(summary.totals.unknownCostTokens).toBe(580)
    expect(summary.auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Cost unknown for this model.',
          model: 'unknown-future-model',
        }),
        expect.objectContaining({ label: 'Unassigned usage', attributionMethod: 'unmatched' }),
      ]),
    )
  })

  it('treats partial pricing as unknown when used token categories are unpriced', () => {
    const summary = buildUsageSummary(
      [
        record({
          model: 'partial-model',
          tokens: tokens({
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 30,
            totalTokens: 150,
          }),
        }),
      ],
      {
        periodDays: 7,
        now: new Date('2026-05-15T12:00:00.000Z'),
        prices: [
          {
            model: 'partial-model',
            provider: 'test',
            inputUsdPerMillion: 3,
            cachedInputUsdPerMillion: null,
            cacheCreationInputUsdPerMillion: null,
            outputUsdPerMillion: 15,
            reasoningOutputUsdPerMillion: null,
            source: 'litellm',
            fetchedAt: '2026-05-15T00:00:00.000Z',
            rawVersion: 'test',
          },
        ],
        pricingStatus: 'fresh',
      },
    )

    expect(summary.totals.estimatedCostUsd).toBeNull()
    expect(summary.totals.unknownCostTokens).toBe(150)
    expect(summary.auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'unknown-price:partial-model',
          model: 'partial-model',
          unknownCostTokens: 150,
        }),
      ]),
    )
  })

  it('sorts project model and agent breakdowns by tokens descending', () => {
    const summary = buildUsageSummary(
      [
        record({
          agent: 'codex',
          project: 'big-project',
          model: 'gpt-5-codex',
          tokens: tokens({ inputTokens: 900, outputTokens: 100, totalTokens: 1_000 }),
        }),
        record({
          agent: 'claude-code',
          project: 'small-project',
          model: 'claude-sonnet-4-5',
          tokens: tokens({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
        }),
      ],
      {
        periodDays: 7,
        now: new Date('2026-05-15T12:00:00.000Z'),
        prices: normalizeLiteLlmPricingPayload(pricingFixture(), '2026-05-15T00:00:00.000Z'),
        pricingStatus: 'fresh',
      },
    )

    expect(summary.byProject.map((row) => row.key)).toEqual(['big-project', 'small-project'])
    expect(summary.byModel.map((row) => row.key)).toEqual(['gpt-5-codex', 'claude-sonnet-4-5'])
    expect(summary.byAgent.map((row) => row.key)).toEqual(['codex', 'claude-code'])
  })
})
