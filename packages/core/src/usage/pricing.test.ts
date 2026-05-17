import { describe, expect, it } from 'vitest'
import {
  estimateUsageCostUsd,
  lookupUsagePrice,
  normalizeModelsDevPricingPayload,
  pricingStatusFromCache,
  resolveUsagePrice,
} from './pricing.js'
import type { UsagePricingEntry, UsageTokenBreakdown } from './types.js'

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

function priceEntry(overrides: Partial<UsagePricingEntry> = {}): UsagePricingEntry {
  return {
    model: 'priced-model',
    provider: 'test',
    inputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.3,
    cacheCreationInputUsdPerMillion: 3.75,
    outputUsdPerMillion: 15,
    reasoningOutputUsdPerMillion: null,
    source: 'models.dev',
    fetchedAt: '2026-05-15T00:00:00.000Z',
    rawVersion: 'test',
    ...overrides,
  }
}

describe('normalizeModelsDevPricingPayload', () => {
  it('normalizes official provider pricing and context tiers from models.dev', () => {
    const prices = normalizeModelsDevPricingPayload(
      {
        providers: {
          openai: {
            id: 'openai',
            models: {
              'gpt-5.5': {
                id: 'gpt-5.5',
                cost: {
                  input: 5,
                  output: 30,
                  cache_read: 0.5,
                  tiers: [
                    {
                      input: 10,
                      output: 45,
                      cache_read: 1,
                      tier: { type: 'context', size: 272_000 },
                    },
                  ],
                },
              },
            },
          },
          anthropic: {
            id: 'anthropic',
            models: {
              'claude-sonnet-4-5': {
                id: 'claude-sonnet-4-5',
                cost: {
                  input: 3,
                  output: 15,
                  cache_read: 0.3,
                  cache_write: 3.75,
                  context_over_200k: {
                    input: 6,
                    output: 22.5,
                    cache_read: 0.6,
                    cache_write: 7.5,
                  },
                },
              },
            },
          },
          reseller: {
            id: 'reseller',
            models: {
              'gpt-5.5': {
                id: 'gpt-5.5',
                cost: { input: 99, output: 99 },
              },
            },
          },
        },
      },
      '2026-05-15T01:00:00.000Z',
    )

    expect(prices).toHaveLength(3)
    expect(lookupUsagePrice('gpt-5.5', prices)).toMatchObject({
      model: 'gpt-5.5',
      provider: 'openai',
      source: 'models.dev',
      thresholdTokens: 272_000,
      inputUsdPerMillionAboveThreshold: 10,
      outputUsdPerMillionAboveThreshold: 45,
      longContextAppliesToWholeRow: true,
    })
    expect(lookupUsagePrice('claude-sonnet-4-5', prices)).toMatchObject({
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      thresholdTokens: 200_000,
      cacheCreationInputUsdPerMillionAboveThreshold: 7.5,
    })
    expect(lookupUsagePrice('reseller/gpt-5.5', prices)).toMatchObject({
      model: 'gpt-5.5',
      provider: 'reseller',
      inputUsdPerMillion: 99,
    })
  })

  it('normalizes common official providers from models.dev with bare model ids', () => {
    const prices = normalizeModelsDevPricingPayload(
      {
        google: {
          id: 'google',
          models: {
            'gemini-2.5-flash': {
              cost: { input: 0.3, output: 2.5, cache_read: 0.03 },
            },
          },
        },
        moonshotai: {
          id: 'moonshotai',
          models: {
            'kimi-k2.5': {
              cost: { input: 0.6, output: 3, cache_read: 0.1 },
            },
          },
        },
        xiaomi: {
          id: 'xiaomi',
          models: {
            'mimo-v2.5-pro': {
              cost: {
                input: 1,
                output: 3,
                cache_read: 0.2,
                tiers: [
                  {
                    input: 2,
                    output: 6,
                    cache_read: 0.4,
                    tier: { type: 'context', size: 256_000 },
                  },
                ],
              },
            },
          },
        },
        zai: {
          id: 'zai',
          models: {
            'glm-4.7': {
              cost: { input: 0.6, output: 2.2, cache_read: 0.11 },
            },
          },
        },
        alibaba: {
          id: 'alibaba',
          models: {
            'qwen3-max': {
              cost: { input: 1.2, output: 6 },
            },
          },
        },
        openrouter: {
          id: 'openrouter',
          models: {
            'xiaomi/mimo-v2.5-pro': {
              cost: { input: 1.1, output: 3.3, cache_read: 0.22 },
            },
          },
        },
      },
      '2026-05-15T01:00:00.000Z',
    )

    expect(lookupUsagePrice('gemini-2.5-flash', prices)).toMatchObject({ provider: 'google' })
    expect(lookupUsagePrice('kimi-k2.5', prices)).toMatchObject({ provider: 'moonshotai' })
    expect(lookupUsagePrice('mimo-v2.5-pro', prices)).toMatchObject({
      provider: 'xiaomi',
      thresholdTokens: 256_000,
      inputUsdPerMillionAboveThreshold: 2,
    })
    expect(resolveUsagePrice('glm-4-7', prices)).toMatchObject({
      matchedModel: 'glm-4.7',
      price: { provider: 'zai' },
    })
    expect(lookupUsagePrice('qwen3-max', prices)).toMatchObject({ provider: 'alibaba' })
    expect(lookupUsagePrice('openrouter/xiaomi/mimo-v2.5-pro', prices)).toMatchObject({
      provider: 'openrouter/xiaomi',
      inputUsdPerMillion: 1.1,
    })
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
      source: 'models.dev',
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
      source: 'models.dev',
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
      source: 'models.dev',
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

  it('returns unknown when model pricing is missing', () => {
    expect(estimateUsageCostUsd(tokens(), null)).toBeNull()
  })

  it('uses built-in pricing when network pricing has not cached a known Codex model', () => {
    const price = lookupUsagePrice('gpt-5.5', [])

    expect(price).toMatchObject({
      model: 'gpt-5.5',
      provider: 'openai',
      source: 'builtin',
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

  it('matches built-in long-context pricing for gpt-5.5 rows above 272k input tokens', () => {
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

  it('matches built-in priority service tier pricing for Codex turns within the priority limit', () => {
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

  it('applies built-in Codex priority pricing when the base price came from cached pricing', () => {
    const price = priceEntry({
      model: 'gpt-5.5',
      provider: 'openai',
      inputUsdPerMillion: 5,
      cachedInputUsdPerMillion: 0.5,
      outputUsdPerMillion: 30,
    })

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

  it('does not apply Codex priority pricing above the priority input limit', () => {
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
      source: 'models.dev',
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
      source: 'models.dev',
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
  it('prefers built-in pricing for known Codex aliases before base fallbacks', () => {
    const prices = [
      priceEntry({
        model: 'gpt-5',
        provider: 'openai',
        inputUsdPerMillion: 1.25,
        outputUsdPerMillion: 10,
      }),
    ]

    expect(lookupUsagePrice('gpt-5-codex', prices)).toMatchObject({
      model: 'gpt-5-codex',
      source: 'builtin',
    })
  })

  it('includes local Claude fallback entries that are not always present in cached pricing', () => {
    expect(lookupUsagePrice('claude-opus-4-6', [])).toMatchObject({
      model: 'claude-opus-4-6',
      provider: 'anthropic',
      source: 'builtin',
      inputUsdPerMillion: 5,
      cacheCreationInputUsdPerMillion: 6.25,
      outputUsdPerMillion: 25,
    })
  })

  it('uses model-encoded routes before falling back to canonical official routes', () => {
    const prices = [
      priceEntry({
        model: 'kimi-k2.5',
        provider: 'moonshotai',
        inputUsdPerMillion: 0.6,
        outputUsdPerMillion: 3,
      }),
      priceEntry({
        model: 'kimi-k2.5',
        provider: 'openrouter/moonshotai',
        inputUsdPerMillion: 0.4,
        outputUsdPerMillion: 2,
      }),
    ]

    expect(resolveUsagePrice('kimi-k2.5', prices)).toMatchObject({
      matchedModel: 'kimi-k2.5',
      matchKind: 'provider-prefix',
      price: { provider: 'moonshotai' },
    })
    expect(resolveUsagePrice('moonshotai/kimi-k2.5', prices)).toMatchObject({
      matchedModel: 'kimi-k2.5',
      matchKind: 'exact',
      price: { provider: 'moonshotai' },
    })
    expect(resolveUsagePrice('openrouter/moonshotai/kimi-k2.5', prices)).toMatchObject({
      matchedModel: 'kimi-k2.5',
      matchKind: 'exact',
      price: { provider: 'openrouter/moonshotai' },
    })
  })

  it('matches duplicate bare model pricing only when the rate is unambiguous', () => {
    const prices = [
      priceEntry({
        model: 'custom-coder',
        provider: 'azure_ai',
        inputUsdPerMillion: 0.6,
        outputUsdPerMillion: 3,
      }),
      priceEntry({
        model: 'custom-coder',
        provider: 'openrouter/vendor',
        inputUsdPerMillion: 0.6,
        outputUsdPerMillion: 3,
      }),
    ]

    const resolved = resolveUsagePrice('custom-coder', prices)

    expect(resolved).toMatchObject({
      matchedModel: 'custom-coder',
      matchKind: 'exact',
      candidateCount: 2,
      price: { provider: 'azure_ai' },
    })
  })

  it('treats conflicting unrouted pricing candidates as unknown', () => {
    const prices = [
      priceEntry({
        model: 'custom-coder',
        provider: 'azure_ai',
        inputUsdPerMillion: 0.6,
        outputUsdPerMillion: 3,
      }),
      priceEntry({
        model: 'custom-coder',
        provider: 'openrouter/vendor',
        inputUsdPerMillion: 0.8,
        outputUsdPerMillion: 4,
      }),
    ]

    expect(resolveUsagePrice('custom-coder', prices)).toMatchObject({
      matchedModel: null,
      matchKind: 'unknown',
      candidateCount: 2,
    })
  })

  it('uses canonical official providers for bare common model names', () => {
    const prices = [
      priceEntry({
        model: 'mimo-v2.5-pro',
        provider: 'xiaomi',
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 3,
      }),
      priceEntry({
        model: 'kimi-k2.6',
        provider: 'moonshotai',
        inputUsdPerMillion: 0.95,
        outputUsdPerMillion: 4,
      }),
      priceEntry({
        model: 'claude-opus-4-6',
        provider: 'anthropic',
        inputUsdPerMillion: 5,
        outputUsdPerMillion: 25,
      }),
      priceEntry({
        model: 'mimo-v2.5-pro',
        provider: 'openrouter/xiaomi',
        inputUsdPerMillion: 1.2,
        outputUsdPerMillion: 3.4,
      }),
    ]

    expect(resolveUsagePrice('mimo-v2.5-pro', prices)).toMatchObject({
      matchedModel: 'mimo-v2.5-pro',
      price: { provider: 'xiaomi' },
    })
    expect(resolveUsagePrice('kimi-k2.6', prices)).toMatchObject({
      matchedModel: 'kimi-k2.6',
      price: { provider: 'moonshotai' },
    })
    expect(resolveUsagePrice('openrouter/xiaomi/mimo-v2.5-pro', prices)).toMatchObject({
      matchedModel: 'mimo-v2.5-pro',
      price: { provider: 'openrouter/xiaomi' },
    })
  })

  it('does not infer pricing provider from agent identity or hidden gateway state', () => {
    const prices = [
      priceEntry({
        model: 'shared-model',
        provider: 'anthropic',
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
      }),
      priceEntry({
        model: 'shared-model',
        provider: 'openrouter/vendor',
        inputUsdPerMillion: 3,
        outputUsdPerMillion: 4,
      }),
    ]

    expect(resolveUsagePrice('shared-model', prices)).toMatchObject({
      matchedModel: null,
      matchKind: 'unknown',
    })
  })

  it('normalizes common model mode suffixes before matching', () => {
    const prices = [
      priceEntry({
        model: 'claude-opus-4-5',
        provider: 'anthropic',
        inputUsdPerMillion: 5,
        outputUsdPerMillion: 25,
      }),
      priceEntry({
        model: 'glm-4.7',
        provider: 'openrouter/z-ai',
        inputUsdPerMillion: 0.4,
        outputUsdPerMillion: 1.5,
      }),
    ]

    expect(resolveUsagePrice('claude-opus-4-5-thinking', prices).matchedModel).toBe(
      'claude-opus-4-5',
    )
    expect(resolveUsagePrice('openrouter/z-ai/glm-4-7', prices)).toMatchObject({
      matchedModel: 'glm-4.7',
      price: { provider: 'openrouter/z-ai' },
    })
  })
})

describe('pricingStatusFromCache', () => {
  it('reports fresh and stale cache status from fetchedAt', () => {
    const fresh = pricingStatusFromCache(
      [priceEntry({ fetchedAt: '2026-05-15T00:00:00.000Z' })],
      new Date('2026-05-15T12:00:00.000Z'),
    )
    const stale = pricingStatusFromCache(
      [priceEntry({ fetchedAt: '2026-05-01T00:00:00.000Z' })],
      new Date('2026-05-15T12:00:00.000Z'),
    )

    expect(fresh).toBe('fresh')
    expect(stale).toBe('cached')
  })
})
