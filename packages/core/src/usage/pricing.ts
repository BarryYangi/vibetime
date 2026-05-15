import type { UsagePricingEntry, UsagePricingStatus, UsageTokenBreakdown } from './types.js'

const MILLION = 1_000_000
const DEFAULT_FRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function perTokenToPerMillion(value: unknown): number | null {
  const rate = nullableNumber(value)
  return rate === null ? null : rate * MILLION
}

function hasAnyRate(entry: UsagePricingEntry): boolean {
  return (
    entry.inputUsdPerMillion !== null ||
    entry.cachedInputUsdPerMillion !== null ||
    entry.cacheCreationInputUsdPerMillion !== null ||
    entry.outputUsdPerMillion !== null ||
    entry.reasoningOutputUsdPerMillion !== null
  )
}

function rawVersionFromPayload(payload: JsonObject): string {
  const version = payload.rawVersion ?? payload.raw_version ?? payload.source ?? payload.version
  return typeof version === 'string' && version ? version : 'unknown'
}

function normalizeSeededModel(
  model: JsonObject,
  fetchedAt: string,
  rawVersion: string,
): UsagePricingEntry | null {
  const modelName = typeof model.model === 'string' ? model.model : null
  const provider = typeof model.provider === 'string' ? model.provider : null
  if (!modelName || !provider) return null

  return {
    model: modelName,
    provider,
    inputUsdPerMillion: nullableNumber(model.inputUsdPerMillion),
    cachedInputUsdPerMillion: nullableNumber(model.cachedInputUsdPerMillion),
    cacheCreationInputUsdPerMillion: nullableNumber(model.cacheCreationInputUsdPerMillion),
    outputUsdPerMillion: nullableNumber(model.outputUsdPerMillion),
    reasoningOutputUsdPerMillion: nullableNumber(model.reasoningOutputUsdPerMillion),
    source: 'litellm',
    fetchedAt,
    rawVersion,
  }
}

function normalizeLiteLlmModel(
  modelName: string,
  model: JsonObject,
  fetchedAt: string,
  rawVersion: string,
): UsagePricingEntry | null {
  const provider =
    typeof model.litellm_provider === 'string'
      ? model.litellm_provider
      : typeof model.provider === 'string'
        ? model.provider
        : null
  if (!provider) return null

  const entry: UsagePricingEntry = {
    model: modelName,
    provider,
    inputUsdPerMillion:
      perTokenToPerMillion(model.input_cost_per_token) ??
      nullableNumber(model.input_per_million_usd),
    cachedInputUsdPerMillion:
      perTokenToPerMillion(model.cache_read_input_token_cost) ??
      perTokenToPerMillion(model.cached_input_cost_per_token) ??
      nullableNumber(model.cached_input_per_million_usd),
    cacheCreationInputUsdPerMillion:
      perTokenToPerMillion(model.cache_creation_input_token_cost) ??
      nullableNumber(model.cache_creation_input_per_million_usd),
    outputUsdPerMillion:
      perTokenToPerMillion(model.output_cost_per_token) ??
      nullableNumber(model.output_per_million_usd),
    reasoningOutputUsdPerMillion:
      perTokenToPerMillion(model.reasoning_output_cost_per_token) ??
      nullableNumber(model.reasoning_output_per_million_usd),
    source: 'litellm',
    fetchedAt,
    rawVersion,
  }

  return hasAnyRate(entry) ? entry : null
}

function modelEntries(payload: JsonObject): Array<[string, JsonObject]> {
  if (Array.isArray(payload.models)) {
    return payload.models
      .filter(isObject)
      .map((model) => [typeof model.model === 'string' ? model.model : '', model])
  }
  if (isObject(payload.models)) {
    return Object.entries(payload.models).filter((entry): entry is [string, JsonObject] =>
      isObject(entry[1]),
    )
  }
  return Object.entries(payload).filter((entry): entry is [string, JsonObject] =>
    isObject(entry[1]),
  )
}

export function normalizeLiteLlmPricingPayload(
  payload: unknown,
  fetchedAt: string,
): UsagePricingEntry[] {
  if (!isObject(payload)) return []

  const rawVersion = rawVersionFromPayload(payload)
  const entries: UsagePricingEntry[] = []

  for (const [modelName, model] of modelEntries(payload)) {
    const normalized = Array.isArray(payload.models)
      ? normalizeSeededModel(model, fetchedAt, rawVersion)
      : normalizeLiteLlmModel(modelName, model, fetchedAt, rawVersion)
    if (normalized) entries.push(normalized)
  }

  return entries
}

export function lookupUsagePrice(
  model: string,
  prices: readonly UsagePricingEntry[],
): UsagePricingEntry | null {
  return prices.find((price) => price.model === model) ?? null
}

export function estimateUsageCostUsd(
  tokens: UsageTokenBreakdown,
  price: UsagePricingEntry | null,
): number | null {
  if (!price || !hasAnyRate(price)) return null

  let cost = 0
  let pricedAny = false
  let unpricedAny = false
  const add = (count: number, rate: number | null): void => {
    if (count <= 0) return
    if (rate === null) {
      unpricedAny = true
      return
    }
    cost += (count / MILLION) * rate
    pricedAny = true
  }

  add(tokens.inputTokens, price.inputUsdPerMillion)
  add(tokens.cachedInputTokens, price.cachedInputUsdPerMillion)
  add(tokens.cacheCreationInputTokens, price.cacheCreationInputUsdPerMillion)
  add(tokens.outputTokens, price.outputUsdPerMillion)
  add(tokens.reasoningOutputTokens, price.reasoningOutputUsdPerMillion)

  if (unpricedAny) return null
  return pricedAny ? cost : null
}

export function pricingStatusFromCache(
  cache: readonly UsagePricingEntry[],
  now: Date,
  freshMaxAgeMs = DEFAULT_FRESH_MAX_AGE_MS,
): UsagePricingStatus {
  if (cache.length === 0) return 'refresh_failed_without_cache'

  const newestFetchedAt = Math.max(
    ...cache.map((entry) => {
      const time = Date.parse(entry.fetchedAt)
      return Number.isFinite(time) ? time : 0
    }),
  )

  return now.getTime() - newestFetchedAt <= freshMaxAgeMs ? 'fresh' : 'cached'
}
