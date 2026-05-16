import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  estimateUsageCostUsd,
  lookupUsagePrice,
  normalizeLiteLlmPricingPayload,
  pricingStatusFromCache,
  resolveUsagePrice,
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

  it('ignores malformed pricing payloads and uses the ccusage zero-cost fallback', () => {
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
    expect(estimateUsageCostUsd(tokens(), lookupUsagePrice('broken/model', prices))).toBe(0)
  })
})

describe('estimateUsageCostUsd', () => {
  it('uses per-million rates without pricing reasoning output twice', () => {
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

    expect(estimateUsageCostUsd(tokens(), price)).toBe(5.775)
  })

  it('does not subtract cache read tokens from Anthropic input tokens and applies Sonnet long-context tiers', () => {
    const price: UsagePricingEntry = {
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      inputUsdPerMillion: 3,
      cachedInputUsdPerMillion: 0.3,
      cacheCreationInputUsdPerMillion: 3.75,
      outputUsdPerMillion: 15,
      reasoningOutputUsdPerMillion: null,
      source: 'litellm',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      rawVersion: 'test',
    }

    expect(estimateUsageCostUsd(tokens(), price)).toBe(10.14)
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
    ).toBe(6.525)
  })

  it('matches ccusage zero-cost fallback when model pricing is missing', () => {
    expect(estimateUsageCostUsd(tokens(), null)).toBe(0)
  })

  it('uses CodexBar built-in pricing when network pricing has not cached a known Codex model', () => {
    const price = lookupUsagePrice('gpt-5.5', [])

    expect(price).toMatchObject({
      model: 'gpt-5.5',
      provider: 'openai',
      source: 'codexbar-builtin',
    })
    expect(
      estimateUsageCostUsd(
        tokens({
          inputTokens: 100_000,
          cachedInputTokens: 20_000,
          cacheCreationInputTokens: 0,
          outputTokens: 10_000,
          totalTokens: 110_000,
        }),
        price,
      ),
    ).toBe(0.71)
  })

  it('matches CodexBar long-context pricing for gpt-5.5 rows above 272k input tokens', () => {
    const price = lookupUsagePrice('gpt-5.5', [])

    expect(
      estimateUsageCostUsd(
        tokens({
          inputTokens: 300_000,
          cachedInputTokens: 50_000,
          cacheCreationInputTokens: 0,
          outputTokens: 10_000,
          totalTokens: 310_000,
        }),
        price,
      ),
    ).toBe(3)
  })

  it('matches CodexBar priority service tier pricing for Codex turns within the priority limit', () => {
    const price = lookupUsagePrice('gpt-5.5', [])

    expect(
      estimateUsageCostUsd(
        tokens({
          inputTokens: 200_000,
          cachedInputTokens: 50_000,
          cacheCreationInputTokens: 0,
          outputTokens: 10_000,
          totalTokens: 210_000,
        }),
        price,
        { codexServiceTier: 'priority' },
      ),
    ).toBe(2.6875)
  })

  it('does not apply Codex priority pricing above CodexBar priority input limit', () => {
    const price = lookupUsagePrice('gpt-5.5', [])

    expect(
      estimateUsageCostUsd(
        tokens({
          inputTokens: 300_000,
          cachedInputTokens: 50_000,
          cacheCreationInputTokens: 0,
          outputTokens: 10_000,
          totalTokens: 310_000,
        }),
        price,
        { codexServiceTier: 'priority' },
      ),
    ).toBe(3)
  })

  it('uses input pricing for cached input tokens when cache read pricing is missing', () => {
    const price: UsagePricingEntry = {
      model: 'priced-model',
      provider: 'test',
      inputUsdPerMillion: 3,
      cachedInputUsdPerMillion: null,
      cacheCreationInputUsdPerMillion: null,
      outputUsdPerMillion: 15,
      reasoningOutputUsdPerMillion: null,
      source: 'litellm',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      rawVersion: 'test',
    }

    expect(
      estimateUsageCostUsd(
        tokens({
          inputTokens: 1_000_000,
          cachedInputTokens: 10,
          cacheCreationInputTokens: 0,
          outputTokens: 1_000_000,
          reasoningOutputTokens: 50_000,
          totalTokens: 2_050_010,
        }),
        price,
      ),
    ).toBe(18)
  })

  it('treats token categories without prices as zero cost', () => {
    const price: UsagePricingEntry = {
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
    }

    expect(
      estimateUsageCostUsd(
        tokens({
          inputTokens: 1_000_000,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 10,
          outputTokens: 1_000_000,
          reasoningOutputTokens: 0,
          totalTokens: 2_000_010,
        }),
        price,
      ),
    ).toBe(18)
  })
})

describe('lookupUsagePrice', () => {
  it('prefers CodexBar built-in pricing for known Codex aliases before base fallbacks', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'alias-test',
        models: {
          'gpt-5': {
            litellm_provider: 'openai',
            input_cost_per_token: 0.00000125,
            output_cost_per_token: 0.00001,
          },
        },
      },
      '2026-05-15T00:00:00.000Z',
    )

    expect(lookupUsagePrice('gpt-5-codex', prices)).toMatchObject({
      model: 'gpt-5-codex',
      source: 'codexbar-builtin',
    })
  })

  it('matches ccusage-style provider-prefixed pricing candidates', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'provider-prefix-test',
        models: {
          'openai/test-model': {
            litellm_provider: 'openai',
            input_cost_per_token: 0.00000125,
            output_cost_per_token: 0.00001,
          },
        },
      },
      '2026-05-15T00:00:00.000Z',
    )

    const resolved = resolveUsagePrice('test-model', prices, { agent: 'codex' })

    expect(resolved).toMatchObject({
      matchedModel: 'openai/test-model',
      matchKind: 'provider-prefix',
    })
  })

  it('matches provider-suffixed pricing only when the rate is unambiguous', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'suffix-test',
        models: {
          'azure_ai/kimi-k2.5': {
            litellm_provider: 'azure_ai',
            input_cost_per_token: 0.0000006,
            output_cost_per_token: 0.000003,
          },
          'openrouter/moonshotai/kimi-k2.5': {
            litellm_provider: 'openrouter',
            input_cost_per_token: 0.0000006,
            output_cost_per_token: 0.000003,
          },
        },
      },
      '2026-05-15T00:00:00.000Z',
    )

    const resolved = resolveUsagePrice('kimi-k2.5', prices)

    expect(resolved).toMatchObject({
      matchedModel: 'azure_ai/kimi-k2.5',
      matchKind: 'suffix',
      candidateCount: 2,
    })
  })

  it('falls back to the first ccusage-compatible suffix candidate when provider rates conflict', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'ambiguous-suffix-test',
        models: {
          'azure_ai/kimi-k2.5': {
            litellm_provider: 'azure_ai',
            input_cost_per_token: 0.0000006,
            output_cost_per_token: 0.000003,
          },
          'openrouter/moonshotai/kimi-k2.5': {
            litellm_provider: 'openrouter',
            input_cost_per_token: 0.0000008,
            output_cost_per_token: 0.000004,
          },
        },
      },
      '2026-05-15T00:00:00.000Z',
    )

    const resolved = resolveUsagePrice('kimi-k2.5', prices)

    expect(resolved).toMatchObject({
      matchedModel: 'azure_ai/kimi-k2.5',
      matchKind: 'suffix',
      candidateCount: 2,
    })
  })

  it('uses provider metadata to disambiguate provider-suffixed pricing', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'provider-disambiguation-test',
        models: {
          'azure_ai/kimi-k2.5': {
            litellm_provider: 'azure_ai',
            input_cost_per_token: 0.0000006,
            output_cost_per_token: 0.000003,
          },
          'openrouter/moonshotai/kimi-k2.5': {
            litellm_provider: 'openrouter',
            input_cost_per_token: 0.0000008,
            output_cost_per_token: 0.000004,
          },
        },
      },
      '2026-05-15T00:00:00.000Z',
    )

    const resolved = resolveUsagePrice('kimi-k2.5', prices, { provider: 'openrouter' })

    expect(resolved).toMatchObject({
      matchedModel: 'openrouter/moonshotai/kimi-k2.5',
      matchKind: 'suffix',
    })
  })

  it('normalizes common model mode suffixes before matching', () => {
    const prices = normalizeLiteLlmPricingPayload(
      {
        rawVersion: 'normalization-test',
        models: {
          'claude-opus-4-5': {
            litellm_provider: 'anthropic',
            input_cost_per_token: 0.000005,
            output_cost_per_token: 0.000025,
          },
          'openrouter/z-ai/glm-4.7': {
            litellm_provider: 'openrouter',
            input_cost_per_token: 0.0000004,
            output_cost_per_token: 0.0000015,
          },
        },
      },
      '2026-05-15T00:00:00.000Z',
    )

    expect(resolveUsagePrice('claude-opus-4-5-thinking', prices).matchedModel).toBe(
      'claude-opus-4-5',
    )
    expect(resolveUsagePrice('glm-4-7', prices, { provider: 'openrouter' }).matchedModel).toBe(
      'openrouter/z-ai/glm-4.7',
    )
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
