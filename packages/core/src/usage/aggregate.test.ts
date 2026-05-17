import { describe, expect, it } from 'vitest'
import { buildUsagePeriodCompare, buildUsageSummary } from './aggregate.js'
import type { UsagePricingEntry, UsageRecordFact, UsageTokenBreakdown } from './types.js'

const PRICES: UsagePricingEntry[] = [
  {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    inputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.3,
    cacheCreationInputUsdPerMillion: 3.75,
    outputUsdPerMillion: 15,
    reasoningOutputUsdPerMillion: null,
    source: 'models.dev',
    fetchedAt: '2026-05-15T00:00:00.000Z',
    rawVersion: 'test',
  },
  {
    model: 'gpt-5-codex',
    provider: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    cacheCreationInputUsdPerMillion: null,
    outputUsdPerMillion: 10,
    reasoningOutputUsdPerMillion: null,
    source: 'models.dev',
    fetchedAt: '2026-05-15T00:00:00.000Z',
    rawVersion: 'test',
  },
]

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
        prices: PRICES,
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
      prices: PRICES,
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

  it('keeps unknown model pricing auditable without treating it as zero cost', () => {
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
        prices: PRICES,
        pricingStatus: 'fresh',
      },
    )

    expect(summary.totals.estimatedCostUsd).toBeNull()
    expect(summary.totals.unknownCostTokens).toBe(580)
    expect(summary.auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Cost unknown for this model',
          model: 'unknown-future-model',
          estimatedCostUsd: null,
          unknownCostTokens: 580,
        }),
        expect.objectContaining({ label: 'Unassigned usage', attributionMethod: 'unmatched' }),
      ]),
    )
  })

  it('treats missing token-category rates as zero without marking the model unknown', () => {
    const summary = buildUsageSummary(
      [
        record({
          model: 'partial-model',
          tokens: tokens({
            inputTokens: 100,
            cachedInputTokens: 0,
            cacheCreationInputTokens: 20,
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
            source: 'models.dev',
            fetchedAt: '2026-05-15T00:00:00.000Z',
            rawVersion: 'test',
          },
        ],
        pricingStatus: 'fresh',
      },
    )

    expect(summary.totals.estimatedCostUsd).toBe(0.00075)
    expect(summary.totals.unknownCostTokens).toBe(0)
    expect(summary.auditRows).toEqual([])
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
        prices: PRICES,
        pricingStatus: 'fresh',
      },
    )

    expect(summary.byProject.map((row) => row.key)).toEqual(['big-project', 'small-project'])
    expect(summary.byModel.map((row) => row.key)).toEqual(['gpt-5-codex', 'claude-sonnet-4-5'])
    expect(summary.byAgent.map((row) => row.key)).toEqual(['codex', 'claude-code'])
  })

  it('builds previous-period comparisons only when comparable values exist', () => {
    const prices = PRICES
    const current = buildUsageSummary(
      [record({ tokens: tokens({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }) })],
      {
        periodDays: 7,
        now: new Date('2026-05-15T12:00:00.000Z'),
        prices,
        pricingStatus: 'fresh',
      },
    )
    const previous = buildUsageSummary(
      [
        record({
          ts: Date.parse('2026-05-08T12:00:00.000Z') / 1000,
          tokens: tokens({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
        }),
      ],
      {
        periodDays: 7,
        now: new Date('2026-05-08T12:00:00.000Z'),
        prices,
        pricingStatus: 'fresh',
      },
    )

    const comparison = buildUsagePeriodCompare(
      {
        ...current,
        efficiency: {
          ...current.efficiency,
          totals: { ...current.efficiency.totals, costPerHourUsd: 4 },
        },
      },
      {
        ...previous,
        efficiency: {
          ...previous.efficiency,
          totals: { ...previous.efficiency.totals, durationSec: 3600, costPerHourUsd: 2 },
        },
      },
    )

    expect(comparison.estimatedCostUsd.previousValue).toBe(previous.totals.estimatedCostUsd)
    expect(comparison.estimatedCostUsd.deltaRatio).toBeCloseTo(1)
    expect(comparison.costPerHourUsd.delta).toBe(2)

    const emptyPrevious = buildUsageSummary([], {
      periodDays: 7,
      now: new Date('2026-05-08T12:00:00.000Z'),
      prices,
      pricingStatus: 'fresh',
    })
    expect(buildUsagePeriodCompare(current, emptyPrevious).estimatedCostUsd.delta).toBeNull()
  })
})
