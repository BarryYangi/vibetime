import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  estimateUsageCostUsd,
  lookupUsagePrice,
  normalizeLiteLlmPricingPayload,
  pricingStatusFromCache,
} from './pricing.js'
import type { UsagePricingEntry, UsageTokenBreakdown } from './types.js'

function readPricingFixture(): unknown {
  return JSON.parse(
    readFileSync(new URL('./__fixtures__/pricing-cache.json', import.meta.url), 'utf8'),
  )
}

function tokens(overrides: Partial<UsageTokenBreakdown> = {}): UsageTokenBreakdown {
  const value = {
    inputTokens: 1_000_000,
    cachedInputTokens: 500_000,
    cacheCreationInputTokens: 100_000,
    outputTokens: 250_000,
    reasoningOutputTokens: 50_000,
    totalTokens: 1_900_000,
    ...overrides,
  }
  return value
}

describe('normalizeLiteLlmPricingPayload', () => {
  it('normalizes the seeded cache into pricing entries', () => {
    const prices = normalizeLiteLlmPricingPayload(readPricingFixture(), '2026-05-15T00:00:00.000Z')

    expect(lookupUsagePrice('claude-sonnet-4-5', prices)).toMatchObject({
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      inputUsdPerMillion: 3,
      cachedInputUsdPerMillion: 0.3,
      cacheCreationInputUsdPerMillion: 3.75,
      outputUsdPerMillion: 15,
      source: 'litellm',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      rawVersion: '2026-05-15-fixture',
    })
  })

  it('normalizes refresh payload fields from LiteLLM pricing shape', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'refresh-1',
        models: {
          'provider/model-a': {
            litellm_provider: 'anthropic',
            input_cost_per_token: 0.000003,
            cache_read_input_token_cost: 0.0000003,
            cache_creation_input_token_cost: 0.00000375,
            output_cost_per_token: 0.000015,
          },
        },
      },
      '2026-05-15T01:00:00.000Z',
    )

    expect(prices).toEqual([
      {
        model: 'provider/model-a',
        provider: 'anthropic',
        inputUsdPerMillion: 3,
        cachedInputUsdPerMillion: 0.3,
        cacheCreationInputUsdPerMillion: 3.75,
        outputUsdPerMillion: 15,
        reasoningOutputUsdPerMillion: null,
        source: 'litellm',
        fetchedAt: '2026-05-15T01:00:00.000Z',
        rawVersion: 'refresh-1',
      },
    ])
  })

  it('ignores malformed pricing payloads instead of turning unknown model cost into zero', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'bad-refresh',
        models: {
          'broken/model': {
            input_cost_per_token: 'free',
            output_cost_per_token: {},
          },
        },
      },
      '2026-05-15T01:00:00.000Z',
    )

    expect(prices).toEqual([])
    expect(lookupUsagePrice('broken/model', prices)).toBeNull()
    expect(estimateUsageCostUsd(tokens(), lookupUsagePrice('broken/model', prices))).toBeNull()
  })
})

describe('estimateUsageCostUsd', () => {
  it('uses per-million rates including separately priced reasoning output tokens', () => {
    const price: UsagePricingEntry = {
      model: 'priced-model',
      provider: 'test',
      inputUsdPerMillion: 3,
      cachedInputUsdPerMillion: 0.3,
      cacheCreationInputUsdPerMillion: 3.75,
      outputUsdPerMillion: 15,
      reasoningOutputUsdPerMillion: 15,
      source: 'litellm',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      rawVersion: 'test',
    }

    expect(estimateUsageCostUsd(tokens(), price)).toBe(8.025)
  })

  it('does not double count reasoning output tokens when they are folded into output tokens', () => {
    const price: UsagePricingEntry = {
      model: 'priced-model',
      provider: 'test',
      inputUsdPerMillion: 3,
      cachedInputUsdPerMillion: 0.3,
      cacheCreationInputUsdPerMillion: 3.75,
      outputUsdPerMillion: 15,
      reasoningOutputUsdPerMillion: 15,
      source: 'litellm',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      rawVersion: 'test',
    }

    expect(
      estimateUsageCostUsd(
        tokens({
          outputTokens: 300_000,
          reasoningOutputTokens: 0,
          totalTokens: 1_450_000,
        }),
        price,
      ),
    ).toBe(8.025)
  })

  it('returns null for unknown model pricing', () => {
    expect(estimateUsageCostUsd(tokens(), null)).toBeNull()
  })
})

describe('pricingStatusFromCache', () => {
  it('reports fresh and stale cache status from fetchedAt', () => {
    const fresh = pricingStatusFromCache(
      normalizeLiteLlmPricingPayload(readPricingFixture(), '2026-05-15T00:00:00.000Z'),
      new Date('2026-05-15T12:00:00.000Z'),
    )
    const stale = pricingStatusFromCache(
      normalizeLiteLlmPricingPayload(readPricingFixture(), '2026-05-01T00:00:00.000Z'),
      new Date('2026-05-15T12:00:00.000Z'),
    )

    expect(fresh).toBe('fresh')
    expect(stale).toBe('cached')
  })
})
