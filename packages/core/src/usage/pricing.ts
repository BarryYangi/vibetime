import type {
  UsageAgent,
  UsagePriceResolution,
  UsagePricingEntry,
  UsagePricingStatus,
  UsageTokenBreakdown,
} from './types.js'

const MILLION = 1_000_000
const CODEX_PRIORITY_INPUT_TOKEN_LIMIT = 272_000
const DEFAULT_FRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_PROVIDER_PREFIXES = [
  'anthropic/',
  'claude-3-5-',
  'claude-3-',
  'claude-',
  'openai/',
  'azure/',
  'openrouter/openai/',
] as const
const CODEX_PROVIDER_PREFIXES = ['openai/', 'azure/', 'openrouter/openai/'] as const
const CLAUDE_PROVIDER_PREFIXES = ['anthropic/'] as const
const CODEX_MODEL_ALIASES: Record<string, string[]> = {
  'gpt-5-codex': ['gpt-5'],
  'gpt-5.3-codex': ['gpt-5.2-codex'],
}
const MODE_SUFFIXES = ['-thinking', '-high', '-medium', '-low', '-fast'] as const

type JsonObject = Record<string, unknown>
type UsagePriceLookupContext = {
  agent?: UsageAgent
  provider?: string | null
}
type UsagePriceResolver = (model: string, context?: UsagePriceLookupContext) => UsagePriceResolution
type RateOverride = {
  provider: string
  inputUsdPerMillion: number
  cachedInputUsdPerMillion: number | null
  cacheCreationInputUsdPerMillion?: number | null
  outputUsdPerMillion: number
  priorityInputUsdPerMillion?: number
  priorityCachedInputUsdPerMillion?: number | null
  priorityOutputUsdPerMillion?: number
  thresholdTokens?: number
  inputUsdPerMillionAboveThreshold?: number
  cachedInputUsdPerMillionAboveThreshold?: number | null
  cacheCreationInputUsdPerMillionAboveThreshold?: number | null
  outputUsdPerMillionAboveThreshold?: number
  codexLongContextAppliesToWholeRow?: boolean
}

const CODEXBAR_RATE_OVERRIDES: Record<string, RateOverride> = {
  'gpt-5': {
    provider: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  'gpt-5-codex': {
    provider: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  'gpt-5-mini': {
    provider: 'openai',
    inputUsdPerMillion: 0.25,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 2,
  },
  'gpt-5-nano': {
    provider: 'openai',
    inputUsdPerMillion: 0.05,
    cachedInputUsdPerMillion: 0.005,
    outputUsdPerMillion: 0.4,
  },
  'gpt-5-pro': {
    provider: 'openai',
    inputUsdPerMillion: 15,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 120,
  },
  'gpt-5.1': {
    provider: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  'gpt-5.1-codex': {
    provider: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  'gpt-5.1-codex-max': {
    provider: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  'gpt-5.1-codex-mini': {
    provider: 'openai',
    inputUsdPerMillion: 0.25,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 2,
  },
  'gpt-5.2': {
    provider: 'openai',
    inputUsdPerMillion: 1.75,
    cachedInputUsdPerMillion: 0.175,
    outputUsdPerMillion: 14,
  },
  'gpt-5.2-codex': {
    provider: 'openai',
    inputUsdPerMillion: 1.75,
    cachedInputUsdPerMillion: 0.175,
    outputUsdPerMillion: 14,
  },
  'gpt-5.2-pro': {
    provider: 'openai',
    inputUsdPerMillion: 21,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 168,
  },
  'gpt-5.3-codex': {
    provider: 'openai',
    inputUsdPerMillion: 1.75,
    cachedInputUsdPerMillion: 0.175,
    outputUsdPerMillion: 14,
  },
  'gpt-5.3-codex-spark': {
    provider: 'openai',
    inputUsdPerMillion: 0,
    cachedInputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
  },
  'gpt-5.4': {
    provider: 'openai',
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 15,
    thresholdTokens: 272_000,
    inputUsdPerMillionAboveThreshold: 5,
    cachedInputUsdPerMillionAboveThreshold: 0.5,
    outputUsdPerMillionAboveThreshold: 22.5,
    priorityInputUsdPerMillion: 5,
    priorityCachedInputUsdPerMillion: 0.5,
    priorityOutputUsdPerMillion: 30,
    codexLongContextAppliesToWholeRow: true,
  },
  'gpt-5.4-mini': {
    provider: 'openai',
    inputUsdPerMillion: 0.75,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 4.5,
    priorityInputUsdPerMillion: 1.5,
    priorityCachedInputUsdPerMillion: 0.15,
    priorityOutputUsdPerMillion: 9,
  },
  'gpt-5.4-nano': {
    provider: 'openai',
    inputUsdPerMillion: 0.2,
    cachedInputUsdPerMillion: 0.02,
    outputUsdPerMillion: 1.25,
  },
  'gpt-5.4-pro': {
    provider: 'openai',
    inputUsdPerMillion: 30,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 180,
  },
  'gpt-5.5': {
    provider: 'openai',
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30,
    thresholdTokens: 272_000,
    inputUsdPerMillionAboveThreshold: 10,
    cachedInputUsdPerMillionAboveThreshold: 1,
    outputUsdPerMillionAboveThreshold: 45,
    priorityInputUsdPerMillion: 12.5,
    priorityCachedInputUsdPerMillion: 1.25,
    priorityOutputUsdPerMillion: 75,
    codexLongContextAppliesToWholeRow: true,
  },
  'gpt-5.5-pro': {
    provider: 'openai',
    inputUsdPerMillion: 30,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 180,
  },
  'claude-sonnet-4-5': {
    provider: 'anthropic',
    inputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.3,
    cacheCreationInputUsdPerMillion: 3.75,
    outputUsdPerMillion: 15,
    thresholdTokens: 200_000,
    inputUsdPerMillionAboveThreshold: 6,
    cachedInputUsdPerMillionAboveThreshold: 0.6,
    cacheCreationInputUsdPerMillionAboveThreshold: 7.5,
    outputUsdPerMillionAboveThreshold: 22.5,
  },
  'claude-sonnet-4-5-20250929': {
    provider: 'anthropic',
    inputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.3,
    cacheCreationInputUsdPerMillion: 3.75,
    outputUsdPerMillion: 15,
    thresholdTokens: 200_000,
    inputUsdPerMillionAboveThreshold: 6,
    cachedInputUsdPerMillionAboveThreshold: 0.6,
    cacheCreationInputUsdPerMillionAboveThreshold: 7.5,
    outputUsdPerMillionAboveThreshold: 22.5,
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    inputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.3,
    cacheCreationInputUsdPerMillion: 3.75,
    outputUsdPerMillion: 15,
    thresholdTokens: 200_000,
    inputUsdPerMillionAboveThreshold: 6,
    cachedInputUsdPerMillionAboveThreshold: 0.6,
    cacheCreationInputUsdPerMillionAboveThreshold: 7.5,
    outputUsdPerMillionAboveThreshold: 22.5,
  },
  'claude-haiku-4-5': {
    provider: 'anthropic',
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    cacheCreationInputUsdPerMillion: 1.25,
    outputUsdPerMillion: 5,
  },
  'claude-haiku-4-5-20251001': {
    provider: 'anthropic',
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    cacheCreationInputUsdPerMillion: 1.25,
    outputUsdPerMillion: 5,
  },
  'claude-opus-4-5': {
    provider: 'anthropic',
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    cacheCreationInputUsdPerMillion: 6.25,
    outputUsdPerMillion: 25,
  },
  'claude-opus-4-5-20251101': {
    provider: 'anthropic',
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    cacheCreationInputUsdPerMillion: 6.25,
    outputUsdPerMillion: 25,
  },
}

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

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase()
}

function pricingEntryFromOverride(model: string, override: RateOverride): UsagePricingEntry {
  return {
    model,
    provider: override.provider,
    inputUsdPerMillion: override.inputUsdPerMillion,
    cachedInputUsdPerMillion: override.cachedInputUsdPerMillion,
    cacheCreationInputUsdPerMillion: override.cacheCreationInputUsdPerMillion ?? null,
    outputUsdPerMillion: override.outputUsdPerMillion,
    reasoningOutputUsdPerMillion: null,
    source: 'codexbar-builtin',
    fetchedAt: 'builtin',
    rawVersion: 'codexbar',
  }
}

function exactOverride(model: string): UsagePricingEntry | null {
  const override = CODEXBAR_RATE_OVERRIDES[model]
  return override ? pricingEntryFromOverride(model, override) : null
}

function rateSignature(entry: UsagePricingEntry): string {
  return [
    entry.inputUsdPerMillion,
    entry.cachedInputUsdPerMillion,
    entry.cacheCreationInputUsdPerMillion,
    entry.outputUsdPerMillion,
    entry.reasoningOutputUsdPerMillion,
  ].join('|')
}

function providerHints(context: UsagePriceLookupContext, model: string): string[] {
  const hints: string[] = []
  if (context.provider) hints.push(normalizeLookupKey(context.provider))
  if (model.startsWith('claude-')) hints.push('anthropic')
  if (model.startsWith('gpt-')) hints.push('openai')
  if (context.agent === 'claude-code') hints.push('anthropic')
  return Array.from(new Set(hints))
}

function providerMatches(entry: UsagePricingEntry, hints: readonly string[]): boolean {
  const provider = normalizeLookupKey(entry.provider)
  const model = normalizeLookupKey(entry.model)
  return hints.some(
    (hint) => provider === hint || provider.startsWith(`${hint}_`) || model.startsWith(`${hint}/`),
  )
}

function chooseUsableEntry(
  entries: readonly UsagePricingEntry[],
  context: UsagePriceLookupContext,
  model: string,
): UsagePricingEntry | null {
  const usable = entries.filter(hasAnyRate)
  if (usable.length === 0) return null
  if (usable.length === 1) return usable[0] ?? null

  const hints = providerHints(context, model)
  const providerMatchesEntries =
    hints.length > 0 ? usable.filter((entry) => providerMatches(entry, hints)) : []
  if (providerMatchesEntries.length === 1) return providerMatchesEntries[0] ?? null

  const signatures = new Set(usable.map(rateSignature))
  if (signatures.size === 1) {
    return [...usable].sort((a, b) => a.model.localeCompare(b.model))[0] ?? null
  }

  return null
}

function firstUsableEntry(entries: readonly UsagePricingEntry[]): UsagePricingEntry | null {
  return entries.find(hasAnyRate) ?? null
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function stripKnownProviderPrefix(model: string): string {
  return model.replace(/^(openai|anthropic|azure|azure_ai|openrouter\/openai)\//, '')
}

function normalizedModelCandidates(model: string): string[] {
  const raw = normalizeLookupKey(model)
  const withoutKnownProvider = stripKnownProviderPrefix(raw)
  const candidates = [raw, withoutKnownProvider]

  const dated = withoutKnownProvider.match(/^(gpt-[\w.-]+)-\d{4}-\d{2}-\d{2}$/)
  if (dated?.[1]) candidates.push(dated[1])

  const glmDashVersion = withoutKnownProvider.match(/^(glm-\d+)-(\d+)$/)
  if (glmDashVersion) candidates.push(`${glmDashVersion[1]}.${glmDashVersion[2]}`)

  candidates.push(withoutKnownProvider.replace(/k2p(\d+)/g, 'k2.$1'))

  for (const suffix of MODE_SUFFIXES) {
    if (withoutKnownProvider.endsWith(suffix)) {
      const stripped = withoutKnownProvider.slice(0, -suffix.length)
      candidates.push(stripped)
      if (stripped === 'gemini-3-pro') candidates.push('gemini-3-pro-preview')
    }
  }

  return unique(candidates)
}

function rawModelCandidates(model: string): string[] {
  const raw = normalizeLookupKey(model)
  return unique([raw, stripKnownProviderPrefix(raw)])
}

function aliasCandidates(model: string): string[] {
  const normalized = normalizeLookupKey(model)
  const aliases = CODEX_MODEL_ALIASES[normalized] ?? []
  const genericCodexAlias = normalized.endsWith('-codex') ? [normalized.replace(/-codex$/, '')] : []
  const claudeThinkingAlias =
    normalized.startsWith('claude-') && normalized.endsWith('-thinking')
      ? [normalized.replace(/-thinking$/, '')]
      : []
  return unique([...aliases, ...genericCodexAlias, ...claudeThinkingAlias])
}

function providerPrefixesFor(model: string, context: UsagePriceLookupContext): readonly string[] {
  if (context.agent === 'codex' || model.startsWith('gpt-')) return CODEX_PROVIDER_PREFIXES
  if (context.agent === 'claude-code' || model.startsWith('claude-'))
    return CLAUDE_PROVIDER_PREFIXES
  return DEFAULT_PROVIDER_PREFIXES
}

function buildPriceIndex(prices: readonly UsagePricingEntry[]): Map<string, UsagePricingEntry[]> {
  const index = new Map<string, UsagePricingEntry[]>()
  for (const price of prices) {
    const key = normalizeLookupKey(price.model)
    const entries = index.get(key) ?? []
    entries.push(price)
    index.set(key, entries)
  }
  return index
}

function resolveFromNames(
  names: readonly string[],
  index: Map<string, UsagePricingEntry[]>,
  context: UsagePriceLookupContext,
  requestedModel: string,
): { price: UsagePricingEntry; candidateCount: number } | null {
  const entries = names.flatMap((name) => index.get(normalizeLookupKey(name)) ?? [])
  const price = chooseUsableEntry(entries, context, requestedModel)
  return price ? { price, candidateCount: entries.length } : null
}

function resolveFromOverrides(names: readonly string[]): UsagePricingEntry | null {
  for (const name of names) {
    const override = exactOverride(normalizeLookupKey(name))
    if (override) return override
  }
  return null
}

function suffixMatches(
  names: readonly string[],
  prices: readonly UsagePricingEntry[],
): UsagePricingEntry[] {
  const normalizedNames = names.map(normalizeLookupKey)
  return prices.filter((price) => {
    const model = normalizeLookupKey(price.model)
    return normalizedNames.some((name) => model.endsWith(`/${name}`))
  })
}

function containsMatches(
  names: readonly string[],
  prices: readonly UsagePricingEntry[],
): UsagePricingEntry[] {
  const normalizedNames = names.map(normalizeLookupKey)
  return prices.filter((price) => {
    const model = normalizeLookupKey(price.model)
    return normalizedNames.some((name) => model.includes(name) || name.includes(model))
  })
}

function resolution(
  requestedModel: string,
  price: UsagePricingEntry | null,
  matchKind: UsagePriceResolution['matchKind'],
  reason: string,
  candidateCount = price ? 1 : 0,
): UsagePriceResolution {
  return {
    requestedModel,
    matchedModel: price?.model ?? null,
    price,
    matchKind,
    source: price?.source ?? null,
    reason,
    candidateCount,
  }
}

function resolveUsagePriceWithIndex(
  model: string,
  prices: readonly UsagePricingEntry[],
  index: Map<string, UsagePricingEntry[]>,
  context: UsagePriceLookupContext = {},
): UsagePriceResolution {
  const requestedModel = model.trim()
  if (!requestedModel) return resolution(model, null, 'unknown', 'empty model name', 0)

  const raw = rawModelCandidates(requestedModel)
  const normalized = normalizedModelCandidates(requestedModel).filter(
    (candidate) => !raw.includes(candidate),
  )

  const exact = resolveFromNames(raw, index, context, requestedModel)
  if (exact)
    return resolution(
      requestedModel,
      exact.price,
      'exact',
      'matched cached pricing model exactly',
      exact.candidateCount,
    )

  const override = resolveFromOverrides(raw)
  if (override)
    return resolution(requestedModel, override, 'exact', 'matched CodexBar built-in pricing')

  const aliases = aliasCandidates(requestedModel)
  const alias = resolveFromNames(aliases, index, context, requestedModel)
  if (alias)
    return resolution(
      requestedModel,
      alias.price,
      'alias',
      'matched explicit model alias',
      alias.candidateCount,
    )

  const aliasOverride = resolveFromOverrides(aliases)
  if (aliasOverride)
    return resolution(requestedModel, aliasOverride, 'alias', 'matched CodexBar built-in alias')

  const normalizedMatch = resolveFromNames(normalized, index, context, requestedModel)
  if (normalizedMatch)
    return resolution(
      requestedModel,
      normalizedMatch.price,
      'normalized',
      'matched normalized model name',
      normalizedMatch.candidateCount,
    )

  const normalizedOverride = resolveFromOverrides(normalized)
  if (normalizedOverride)
    return resolution(
      requestedModel,
      normalizedOverride,
      'normalized',
      'matched normalized CodexBar built-in pricing',
    )

  const prefixedNames = unique(
    [...raw, ...normalized, ...aliases].flatMap((name) =>
      providerPrefixesFor(name, context).map((prefix) => `${prefix}${name}`),
    ),
  )
  const providerPrefixed = resolveFromNames(prefixedNames, index, context, requestedModel)
  if (providerPrefixed) {
    return resolution(
      requestedModel,
      providerPrefixed.price,
      'provider-prefix',
      'matched provider-prefixed pricing model',
      providerPrefixed.candidateCount,
    )
  }

  const suffixEntries = suffixMatches([...raw, ...normalized, ...aliases], prices)
  const suffix = chooseUsableEntry(suffixEntries, context, requestedModel)
  if (suffix) {
    return resolution(
      requestedModel,
      suffix,
      'suffix',
      'matched unique provider-suffixed pricing model',
      suffixEntries.length,
    )
  }

  const ccusageSuffixFallback = firstUsableEntry(suffixEntries)
  if (ccusageSuffixFallback) {
    return resolution(
      requestedModel,
      ccusageSuffixFallback,
      'suffix',
      'matched first ccusage-compatible provider-suffixed pricing candidate',
      suffixEntries.length,
    )
  }

  const containsEntries = containsMatches([...raw, ...normalized, ...aliases], prices)
  const contains = chooseUsableEntry(containsEntries, context, requestedModel)
  if (contains) {
    return resolution(
      requestedModel,
      contains,
      'contains',
      'matched ccusage-compatible contains pricing candidate',
      containsEntries.length,
    )
  }

  const ccusageContainsFallback = firstUsableEntry(containsEntries)
  if (ccusageContainsFallback) {
    return resolution(
      requestedModel,
      ccusageContainsFallback,
      'contains',
      'matched first ccusage-compatible contains pricing candidate',
      containsEntries.length,
    )
  }

  return resolution(
    requestedModel,
    null,
    'unknown',
    suffixEntries.length > 1
      ? 'multiple pricing candidates have different rates and no provider metadata disambiguates them'
      : 'no pricing candidate found',
    suffixEntries.length,
  )
}

function resolverCacheKey(model: string, context: UsagePriceLookupContext): string {
  return [
    normalizeLookupKey(model),
    context.agent ?? '',
    context.provider ? normalizeLookupKey(context.provider) : '',
  ].join('\0')
}

export function createUsagePriceResolver(prices: readonly UsagePricingEntry[]): UsagePriceResolver {
  const index = buildPriceIndex(prices)
  const cache = new Map<string, UsagePriceResolution>()

  return (model, context = {}) => {
    const key = resolverCacheKey(model, context)
    const cached = cache.get(key)
    if (cached) return cached

    const resolved = resolveUsagePriceWithIndex(model, prices, index, context)
    cache.set(key, resolved)
    return resolved
  }
}

export function resolveUsagePrice(
  model: string,
  prices: readonly UsagePricingEntry[],
  context: UsagePriceLookupContext = {},
): UsagePriceResolution {
  return resolveUsagePriceWithIndex(model, prices, buildPriceIndex(prices), context)
}

export function lookupUsagePrice(
  model: string,
  prices: readonly UsagePricingEntry[],
): UsagePricingEntry | null {
  return resolveUsagePrice(model, prices).price
}

function rateOverrideForPrice(price: UsagePricingEntry): RateOverride | null {
  return CODEXBAR_RATE_OVERRIDES[price.model] ?? null
}

function codexRate(
  price: UsagePricingEntry,
  override: RateOverride | null,
  tokens: UsageTokenBreakdown,
  kind: 'input' | 'cached' | 'output',
  serviceTier?: 'priority' | null,
): number | null {
  if (
    serviceTier === 'priority' &&
    override &&
    tokens.inputTokens <= CODEX_PRIORITY_INPUT_TOKEN_LIMIT
  ) {
    if (kind === 'input') return override.priorityInputUsdPerMillion ?? price.inputUsdPerMillion
    if (kind === 'cached') {
      return (
        override.priorityCachedInputUsdPerMillion ??
        price.cachedInputUsdPerMillion ??
        price.inputUsdPerMillion
      )
    }
    return override.priorityOutputUsdPerMillion ?? price.outputUsdPerMillion
  }

  const usesLongContext =
    override?.codexLongContextAppliesToWholeRow === true &&
    override.thresholdTokens !== undefined &&
    tokens.inputTokens > override.thresholdTokens

  if (!usesLongContext) {
    if (kind === 'input') return price.inputUsdPerMillion
    if (kind === 'cached') return price.cachedInputUsdPerMillion ?? price.inputUsdPerMillion
    return price.outputUsdPerMillion
  }

  if (kind === 'input') return override.inputUsdPerMillionAboveThreshold ?? price.inputUsdPerMillion
  if (kind === 'cached') {
    return (
      override.cachedInputUsdPerMillionAboveThreshold ??
      price.cachedInputUsdPerMillion ??
      price.inputUsdPerMillion
    )
  }
  return override.outputUsdPerMillionAboveThreshold ?? price.outputUsdPerMillion
}

function addTieredCost(
  count: number,
  baseRate: number | null,
  aboveRate: number | null | undefined,
  threshold: number | undefined,
): number | null {
  if (count <= 0 || baseRate === null) return null
  if (threshold === undefined || aboveRate === undefined || aboveRate === null) {
    return (count / MILLION) * baseRate
  }
  const below = Math.min(count, threshold)
  const over = Math.max(0, count - threshold)
  return (below / MILLION) * baseRate + (over / MILLION) * aboveRate
}

export function estimateUsageCostUsd(
  tokens: UsageTokenBreakdown,
  price: UsagePricingEntry | null,
  options: { codexServiceTier?: 'priority' | null } = {},
): number | null {
  if (!price || !hasAnyRate(price)) return 0

  let cost = 0
  let pricedAny = false
  const add = (count: number, rate: number | null): void => {
    if (count <= 0) return
    if (rate === null) return
    cost += (count / MILLION) * rate
    pricedAny = true
  }

  const isAnthropic = price.provider === 'anthropic' || price.model.startsWith('claude')
  const override = rateOverrideForPrice(price)
  const cachedInputTokens = isAnthropic
    ? tokens.cachedInputTokens
    : Math.min(tokens.cachedInputTokens, tokens.inputTokens)
  const billableInputTokens = isAnthropic
    ? tokens.inputTokens
    : Math.max(0, tokens.inputTokens - cachedInputTokens)

  if (isAnthropic && override?.thresholdTokens !== undefined) {
    const addTiered = (
      count: number,
      baseRate: number | null,
      aboveRate: number | null | undefined,
    ): void => {
      const value = addTieredCost(count, baseRate, aboveRate, override.thresholdTokens)
      if (value === null) return
      cost += value
      pricedAny = true
    }
    addTiered(
      billableInputTokens,
      price.inputUsdPerMillion,
      override.inputUsdPerMillionAboveThreshold,
    )
    addTiered(
      cachedInputTokens,
      price.cachedInputUsdPerMillion,
      override.cachedInputUsdPerMillionAboveThreshold,
    )
    addTiered(
      tokens.cacheCreationInputTokens,
      price.cacheCreationInputUsdPerMillion,
      override.cacheCreationInputUsdPerMillionAboveThreshold,
    )
    addTiered(
      tokens.outputTokens,
      price.outputUsdPerMillion,
      override.outputUsdPerMillionAboveThreshold,
    )
  } else {
    add(
      billableInputTokens,
      isAnthropic
        ? price.inputUsdPerMillion
        : codexRate(price, override, tokens, 'input', options.codexServiceTier),
    )
    add(
      cachedInputTokens,
      isAnthropic
        ? price.cachedInputUsdPerMillion
        : codexRate(price, override, tokens, 'cached', options.codexServiceTier),
    )
    add(tokens.cacheCreationInputTokens, price.cacheCreationInputUsdPerMillion)
    add(
      tokens.outputTokens,
      isAnthropic
        ? price.outputUsdPerMillion
        : codexRate(price, override, tokens, 'output', options.codexServiceTier),
    )
  }

  return pricedAny ? cost : 0
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
