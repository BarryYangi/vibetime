import type {
  UsagePriceResolution,
  UsagePricingEntry,
  UsagePricingStatus,
  UsageTokenBreakdown,
} from './types.js'

const MILLION = 1_000_000
const CODEX_PRIORITY_INPUT_TOKEN_LIMIT = 272_000
const DEFAULT_FRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000
const CODEX_MODEL_ALIASES: Record<string, string[]> = {
  'gpt-5-codex': ['gpt-5'],
  'gpt-5.3-codex': ['gpt-5.2-codex'],
}
const MODE_SUFFIXES = ['-thinking', '-high', '-medium', '-low', '-fast'] as const
const OFFICIAL_PROVIDER_RULES = [
  { provider: 'openai', patterns: [/^gpt-/, /^o\d(?:-|$)/, /^chatgpt-/, /^codex-/] },
  { provider: 'anthropic', patterns: [/^claude-/] },
  { provider: 'google', patterns: [/^gemini-/, /^gemma-/] },
  { provider: 'moonshotai', patterns: [/^kimi-/] },
  { provider: 'xiaomi', patterns: [/^mimo-/] },
  { provider: 'zai', patterns: [/^glm-/, /^chatglm-/] },
  { provider: 'alibaba', patterns: [/^qwen/] },
  { provider: 'deepseek', patterns: [/^deepseek-/] },
  { provider: 'xai', patterns: [/^grok-/] },
  { provider: 'mistral', patterns: [/^mistral-/, /^mixtral-/, /^codestral-/, /^ministral-/] },
  { provider: 'cohere', patterns: [/^command-/] },
  { provider: 'perplexity', patterns: [/^sonar(?:-|$)/] },
] as const
const OFFICIAL_PROVIDER_IDS: ReadonlySet<string> = new Set(
  OFFICIAL_PROVIDER_RULES.map((rule) => rule.provider),
)
const GATEWAY_PROVIDER_PREFIXES = new Set([
  'azure',
  'azure_ai',
  'bedrock',
  'bedrock_converse',
  'deepinfra',
  'fireworks-ai',
  'fireworks_ai',
  'groq',
  'huggingface',
  'kilo',
  'novita',
  'novita-ai',
  'openrouter',
  'together_ai',
  'togetherai',
  'vertex_ai',
  'vercel',
  'vercel_ai_gateway',
])

type JsonObject = Record<string, unknown>
type ModelRoute = {
  provider: string | null
  model: string
}
type UsagePriceResolver = (model: string) => UsagePriceResolution
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

const CLAUDE_HAIKU_4_5_RATE: RateOverride = {
  provider: 'anthropic',
  inputUsdPerMillion: 1,
  cachedInputUsdPerMillion: 0.1,
  cacheCreationInputUsdPerMillion: 1.25,
  outputUsdPerMillion: 5,
}

const CLAUDE_OPUS_4_RATE: RateOverride = {
  provider: 'anthropic',
  inputUsdPerMillion: 15,
  cachedInputUsdPerMillion: 1.5,
  cacheCreationInputUsdPerMillion: 18.75,
  outputUsdPerMillion: 75,
}

const CLAUDE_OPUS_4_5_RATE: RateOverride = {
  provider: 'anthropic',
  inputUsdPerMillion: 5,
  cachedInputUsdPerMillion: 0.5,
  cacheCreationInputUsdPerMillion: 6.25,
  outputUsdPerMillion: 25,
}

const CLAUDE_SONNET_4_RATE: RateOverride = {
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
}

const BUILTIN_RATE_OVERRIDES: Record<string, RateOverride> = {
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
    ...CLAUDE_SONNET_4_RATE,
  },
  'claude-sonnet-4-5-20250929': {
    ...CLAUDE_SONNET_4_RATE,
  },
  'claude-sonnet-4-6': {
    ...CLAUDE_SONNET_4_RATE,
  },
  'claude-sonnet-4-20250514': {
    ...CLAUDE_SONNET_4_RATE,
  },
  'claude-haiku-4-5': {
    ...CLAUDE_HAIKU_4_5_RATE,
  },
  'claude-haiku-4-5-20251001': {
    ...CLAUDE_HAIKU_4_5_RATE,
  },
  'claude-opus-4-20250514': {
    ...CLAUDE_OPUS_4_RATE,
  },
  'claude-opus-4-1': {
    ...CLAUDE_OPUS_4_RATE,
  },
  'claude-opus-4-5': {
    ...CLAUDE_OPUS_4_5_RATE,
  },
  'claude-opus-4-5-20251101': {
    ...CLAUDE_OPUS_4_5_RATE,
  },
  'claude-opus-4-6': {
    ...CLAUDE_OPUS_4_5_RATE,
  },
  'claude-opus-4-6-20260205': {
    ...CLAUDE_OPUS_4_5_RATE,
  },
  'claude-opus-4-7': {
    ...CLAUDE_OPUS_4_5_RATE,
  },
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
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

function modelsDevProviders(payload: JsonObject): Array<[string, JsonObject]> {
  const root = isObject(payload.providers) ? payload.providers : payload
  return Object.entries(root).filter((entry): entry is [string, JsonObject] => isObject(entry[1]))
}

function modelsDevProviderId(providerKey: string, provider: JsonObject): string {
  return typeof provider.id === 'string' && provider.id.trim()
    ? provider.id.trim().toLowerCase()
    : providerKey.trim().toLowerCase()
}

function normalizePathSegments(value: string): string[] {
  return value
    .trim()
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function modelsDevPricingRoute(providerId: string, modelName: string): ModelRoute {
  const segments = normalizePathSegments(modelName)
  if (OFFICIAL_PROVIDER_IDS.has(providerId) || segments.length <= 1) {
    return { provider: providerId, model: modelName }
  }

  return {
    provider: `${providerId}/${segments.slice(0, -1).join('/')}`,
    model: segments[segments.length - 1] ?? modelName,
  }
}

function modelsDevContextTier(cost: JsonObject): {
  thresholdTokens: number
  inputUsdPerMillionAboveThreshold: number | null
  cachedInputUsdPerMillionAboveThreshold: number | null
  cacheCreationInputUsdPerMillionAboveThreshold: number | null
  outputUsdPerMillionAboveThreshold: number | null
} | null {
  const tiers = Array.isArray(cost.tiers) ? cost.tiers.filter(isObject) : []
  const contextTiers = tiers
    .map((tier) => {
      const tierInfo = isObject(tier.tier) ? tier.tier : null
      const threshold = nullableNumber(tierInfo?.size)
      if (tierInfo?.type !== 'context' || threshold === null || threshold <= 0) return null
      return {
        thresholdTokens: Math.trunc(threshold),
        inputUsdPerMillionAboveThreshold: nullableNumber(tier.input),
        cachedInputUsdPerMillionAboveThreshold: nullableNumber(tier.cache_read),
        cacheCreationInputUsdPerMillionAboveThreshold: nullableNumber(tier.cache_write),
        outputUsdPerMillionAboveThreshold: nullableNumber(tier.output),
      }
    })
    .filter(
      (
        tier,
      ): tier is {
        thresholdTokens: number
        inputUsdPerMillionAboveThreshold: number | null
        cachedInputUsdPerMillionAboveThreshold: number | null
        cacheCreationInputUsdPerMillionAboveThreshold: number | null
        outputUsdPerMillionAboveThreshold: number | null
      } => tier !== null,
    )
    .sort((a, b) => a.thresholdTokens - b.thresholdTokens)
  if (contextTiers[0]) return contextTiers[0]

  const contextOver200K = isObject(cost.context_over_200k) ? cost.context_over_200k : null
  if (!contextOver200K) return null
  return {
    thresholdTokens: 200_000,
    inputUsdPerMillionAboveThreshold: nullableNumber(contextOver200K.input),
    cachedInputUsdPerMillionAboveThreshold: nullableNumber(contextOver200K.cache_read),
    cacheCreationInputUsdPerMillionAboveThreshold: nullableNumber(contextOver200K.cache_write),
    outputUsdPerMillionAboveThreshold: nullableNumber(contextOver200K.output),
  }
}

function normalizeModelsDevModel(
  providerId: string,
  modelName: string,
  model: JsonObject,
  fetchedAt: string,
  rawVersion: string,
): UsagePricingEntry | null {
  const cost = isObject(model.cost) ? model.cost : null
  if (!cost) return null

  const input = nullableNumber(cost.input)
  const output = nullableNumber(cost.output)
  if (input === null || output === null) return null

  const tier = modelsDevContextTier(cost)
  const route = modelsDevPricingRoute(providerId, modelName)
  return {
    model: route.model,
    provider: route.provider ?? providerId,
    inputUsdPerMillion: input,
    cachedInputUsdPerMillion: nullableNumber(cost.cache_read),
    cacheCreationInputUsdPerMillion: nullableNumber(cost.cache_write),
    outputUsdPerMillion: output,
    reasoningOutputUsdPerMillion: null,
    thresholdTokens: tier?.thresholdTokens ?? null,
    inputUsdPerMillionAboveThreshold: tier?.inputUsdPerMillionAboveThreshold ?? null,
    cachedInputUsdPerMillionAboveThreshold: tier?.cachedInputUsdPerMillionAboveThreshold ?? null,
    cacheCreationInputUsdPerMillionAboveThreshold:
      tier?.cacheCreationInputUsdPerMillionAboveThreshold ?? null,
    outputUsdPerMillionAboveThreshold: tier?.outputUsdPerMillionAboveThreshold ?? null,
    longContextAppliesToWholeRow: providerId === 'openai' && tier !== null ? true : null,
    source: 'models.dev',
    fetchedAt,
    rawVersion,
  }
}

export function normalizeModelsDevPricingPayload(
  payload: unknown,
  fetchedAt: string,
): UsagePricingEntry[] {
  if (!isObject(payload)) return []

  const rawVersion = rawVersionFromPayload(payload)
  const entries: UsagePricingEntry[] = []

  for (const [providerKey, provider] of modelsDevProviders(payload)) {
    const models = isObject(provider.models) ? provider.models : null
    if (!models) continue
    const providerId = modelsDevProviderId(providerKey, provider)
    for (const [modelName, model] of Object.entries(models)) {
      if (!isObject(model)) continue
      const normalized = normalizeModelsDevModel(
        providerId,
        modelName,
        model,
        fetchedAt,
        rawVersion === 'unknown' ? 'models.dev' : rawVersion,
      )
      if (normalized) entries.push(normalized)
    }
  }

  const uniqueEntries = new Map<string, UsagePricingEntry>()
  for (const entry of entries) {
    const key = `${entry.provider}\0${entry.model}`
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, entry)
  }
  return [...uniqueEntries.values()]
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase()
}

function modelRouteFromName(model: string): ModelRoute {
  const normalized = normalizeLookupKey(model)
  const segments = normalizePathSegments(normalized)
  if (segments.length >= 2) {
    return {
      provider: segments.slice(0, -1).join('/'),
      model: segments[segments.length - 1] ?? normalized,
    }
  }
  return { provider: null, model: normalized }
}

function officialProviderForModel(model: string): string | null {
  const normalized = modelRouteFromName(model).model
  return (
    OFFICIAL_PROVIDER_RULES.find((rule) =>
      rule.patterns.some((pattern) => pattern.test(normalized)),
    )?.provider ?? null
  )
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
    thresholdTokens: override.thresholdTokens ?? null,
    inputUsdPerMillionAboveThreshold: override.inputUsdPerMillionAboveThreshold ?? null,
    cachedInputUsdPerMillionAboveThreshold: override.cachedInputUsdPerMillionAboveThreshold ?? null,
    cacheCreationInputUsdPerMillionAboveThreshold:
      override.cacheCreationInputUsdPerMillionAboveThreshold ?? null,
    outputUsdPerMillionAboveThreshold: override.outputUsdPerMillionAboveThreshold ?? null,
    longContextAppliesToWholeRow: override.codexLongContextAppliesToWholeRow ?? null,
    source: 'builtin',
    fetchedAt: 'builtin',
    rawVersion: 'local',
  }
}

function exactOverride(model: string): UsagePricingEntry | null {
  const override = BUILTIN_RATE_OVERRIDES[model]
  return override ? pricingEntryFromOverride(model, override) : null
}

function rateSignature(entry: UsagePricingEntry): string {
  return [
    entry.inputUsdPerMillion,
    entry.cachedInputUsdPerMillion,
    entry.cacheCreationInputUsdPerMillion,
    entry.outputUsdPerMillion,
    entry.reasoningOutputUsdPerMillion,
    entry.thresholdTokens ?? null,
    entry.inputUsdPerMillionAboveThreshold ?? null,
    entry.cachedInputUsdPerMillionAboveThreshold ?? null,
    entry.cacheCreationInputUsdPerMillionAboveThreshold ?? null,
    entry.outputUsdPerMillionAboveThreshold ?? null,
    entry.longContextAppliesToWholeRow ?? null,
  ].join('|')
}

function chooseUsableEntry(entries: readonly UsagePricingEntry[]): UsagePricingEntry | null {
  const usable = entries.filter(hasAnyRate)
  if (usable.length === 0) return null
  if (usable.length === 1) return usable[0] ?? null

  const signatures = new Set(usable.map(rateSignature))
  if (signatures.size !== 1) return null

  return (
    [...usable].sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
    )[0] ?? null
  )
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function stripModelRoutePrefix(model: string): string {
  return modelRouteFromName(model).model
}

function normalizedModelCandidates(model: string): string[] {
  const raw = normalizeLookupKey(model)
  const withoutModelRoute = stripModelRoutePrefix(raw)
  const candidates = [raw, withoutModelRoute]

  const dated = withoutModelRoute.match(/^(gpt-[\w.-]+)-\d{4}-\d{2}-\d{2}$/)
  if (dated?.[1]) candidates.push(dated[1])

  const glmDashVersion = withoutModelRoute.match(/^(glm-\d+)-(\d+)$/)
  if (glmDashVersion) candidates.push(`${glmDashVersion[1]}.${glmDashVersion[2]}`)

  candidates.push(withoutModelRoute.replace(/k2p(\d+)/g, 'k2.$1'))

  for (const suffix of MODE_SUFFIXES) {
    if (withoutModelRoute.endsWith(suffix)) {
      const stripped = withoutModelRoute.slice(0, -suffix.length)
      candidates.push(stripped)
      if (stripped === 'gemini-3-pro') candidates.push('gemini-3-pro-preview')
    }
  }

  return unique(candidates)
}

function rawModelCandidates(model: string): string[] {
  const raw = normalizeLookupKey(model)
  return unique([raw, stripModelRoutePrefix(raw)])
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

function aliasCandidatesForNames(names: readonly string[]): string[] {
  return unique(names.flatMap(aliasCandidates))
}

function isGatewayRouteProvider(provider: string): boolean {
  const firstSegment = normalizePathSegments(provider)[0]
  return firstSegment ? GATEWAY_PROVIDER_PREFIXES.has(firstSegment) : false
}

function routePrefixCandidatesFor(model: string): string[] {
  const route = modelRouteFromName(model)
  const officialProvider = officialProviderForModel(model)
  if (route.provider) {
    const provider = normalizeLookupKey(route.provider)
    return isGatewayRouteProvider(provider)
      ? [provider]
      : unique([provider, officialProvider ?? ''])
  }
  return officialProvider ? [officialProvider] : []
}

function routedNamesForProvider(provider: string, names: readonly string[]): string[] {
  const normalizedProvider = normalizeLookupKey(provider)
  return unique(
    names.map((name) => `${normalizedProvider}/${stripModelRoutePrefix(normalizeLookupKey(name))}`),
  )
}

function buildPriceIndex(prices: readonly UsagePricingEntry[]): Map<string, UsagePricingEntry[]> {
  const index = new Map<string, UsagePricingEntry[]>()
  const add = (key: string, price: UsagePricingEntry): void => {
    const normalizedKey = normalizeLookupKey(key)
    const entries = index.get(normalizedKey) ?? []
    entries.push(price)
    index.set(normalizedKey, entries)
  }
  for (const price of prices) {
    add(price.model, price)
    add(`${price.provider}/${price.model}`, price)
  }
  return index
}

function uniqueEntries(entries: UsagePricingEntry[]): UsagePricingEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${normalizeLookupKey(entry.provider)}\0${normalizeLookupKey(entry.model)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function resolveFromNames(
  names: readonly string[],
  index: Map<string, UsagePricingEntry[]>,
): { price: UsagePricingEntry | null; candidateCount: number } {
  const entries = uniqueEntries(names.flatMap((name) => index.get(normalizeLookupKey(name)) ?? []))
  return {
    price: chooseUsableEntry(entries),
    candidateCount: entries.length,
  }
}

function resolveFromOverrides(names: readonly string[]): UsagePricingEntry | null {
  for (const name of names) {
    const override = exactOverride(normalizeLookupKey(name))
    if (override) return override
  }
  return null
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
  index: Map<string, UsagePricingEntry[]>,
): UsagePriceResolution {
  const requestedModel = model.trim()
  if (!requestedModel) return resolution(model, null, 'unknown', 'empty model name', 0)

  const raw = rawModelCandidates(requestedModel)
  const normalized = normalizedModelCandidates(requestedModel).filter(
    (candidate) => !raw.includes(candidate),
  )
  const aliases = aliasCandidatesForNames([...raw, ...normalized])
  const nonAliasNames = unique([...raw, ...normalized])
  const route = modelRouteFromName(requestedModel)
  const routeProviders = routePrefixCandidatesFor(requestedModel)
  let unresolvedCandidateCount = 0

  for (const provider of routeProviders) {
    const routed = resolveFromNames(routedNamesForProvider(provider, nonAliasNames), index)
    unresolvedCandidateCount = Math.max(unresolvedCandidateCount, routed.candidateCount)
    if (routed.price) {
      return resolution(
        requestedModel,
        routed.price,
        route.provider ? 'exact' : 'provider-prefix',
        route.provider
          ? 'matched routed pricing model'
          : 'matched canonical provider pricing model',
        routed.candidateCount,
      )
    }
  }

  const exact = resolveFromNames(raw, index)
  unresolvedCandidateCount = Math.max(unresolvedCandidateCount, exact.candidateCount)
  if (exact.price)
    return resolution(
      requestedModel,
      exact.price,
      'exact',
      'matched cached pricing model exactly',
      exact.candidateCount,
    )

  const override = resolveFromOverrides(raw)
  if (override) return resolution(requestedModel, override, 'exact', 'matched built-in pricing')

  const aliasOverride = resolveFromOverrides(aliases)
  if (aliasOverride)
    return resolution(requestedModel, aliasOverride, 'alias', 'matched built-in alias')

  for (const provider of routeProviders) {
    const routedAlias = resolveFromNames(routedNamesForProvider(provider, aliases), index)
    unresolvedCandidateCount = Math.max(unresolvedCandidateCount, routedAlias.candidateCount)
    if (routedAlias.price) {
      return resolution(
        requestedModel,
        routedAlias.price,
        'alias',
        'matched routed model alias',
        routedAlias.candidateCount,
      )
    }
  }

  const alias = resolveFromNames(aliases, index)
  unresolvedCandidateCount = Math.max(unresolvedCandidateCount, alias.candidateCount)
  if (alias.price)
    return resolution(
      requestedModel,
      alias.price,
      'alias',
      'matched explicit model alias',
      alias.candidateCount,
    )

  const normalizedMatch = resolveFromNames(normalized, index)
  unresolvedCandidateCount = Math.max(unresolvedCandidateCount, normalizedMatch.candidateCount)
  if (normalizedMatch.price)
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
      'matched normalized built-in pricing',
    )

  return resolution(
    requestedModel,
    null,
    'unknown',
    unresolvedCandidateCount > 1
      ? 'multiple pricing candidates have different rates and no model route disambiguates them'
      : 'no pricing candidate found',
    unresolvedCandidateCount,
  )
}

export function createUsagePriceResolver(prices: readonly UsagePricingEntry[]): UsagePriceResolver {
  const index = buildPriceIndex(prices)
  const cache = new Map<string, UsagePriceResolution>()

  return (model) => {
    const key = normalizeLookupKey(model)
    const cached = cache.get(key)
    if (cached) return cached

    const resolved = resolveUsagePriceWithIndex(model, index)
    cache.set(key, resolved)
    return resolved
  }
}

export function resolveUsagePrice(
  model: string,
  prices: readonly UsagePricingEntry[],
): UsagePriceResolution {
  return resolveUsagePriceWithIndex(model, buildPriceIndex(prices))
}

export function lookupUsagePrice(
  model: string,
  prices: readonly UsagePricingEntry[],
): UsagePricingEntry | null {
  return resolveUsagePrice(model, prices).price
}

function rateOverrideForModel(model: string): RateOverride | null {
  const candidates = unique([
    ...rawModelCandidates(model),
    ...normalizedModelCandidates(model),
    ...aliasCandidates(model),
  ])
  for (const candidate of candidates) {
    const override = BUILTIN_RATE_OVERRIDES[candidate]
    if (override) return override
  }
  return null
}

function rateOverrideForPrice(price: UsagePricingEntry): RateOverride | null {
  return rateOverrideForModel(price.model)
}

function thresholdTokens(
  price: UsagePricingEntry,
  override: RateOverride | null,
): number | undefined {
  return override?.thresholdTokens ?? price.thresholdTokens ?? undefined
}

function longContextAppliesToWholeRow(
  price: UsagePricingEntry,
  override: RateOverride | null,
): boolean {
  return (
    override?.codexLongContextAppliesToWholeRow === true ||
    price.longContextAppliesToWholeRow === true
  )
}

function aboveThresholdRate(
  price: UsagePricingEntry,
  override: RateOverride | null,
  kind: 'input' | 'cached' | 'cacheCreation' | 'output',
): number | null | undefined {
  if (kind === 'input') {
    return override?.inputUsdPerMillionAboveThreshold ?? price.inputUsdPerMillionAboveThreshold
  }
  if (kind === 'cached') {
    return (
      override?.cachedInputUsdPerMillionAboveThreshold ??
      price.cachedInputUsdPerMillionAboveThreshold
    )
  }
  if (kind === 'cacheCreation') {
    return (
      override?.cacheCreationInputUsdPerMillionAboveThreshold ??
      price.cacheCreationInputUsdPerMillionAboveThreshold
    )
  }
  return override?.outputUsdPerMillionAboveThreshold ?? price.outputUsdPerMillionAboveThreshold
}

function codexRate(
  price: UsagePricingEntry,
  override: RateOverride | null,
  tokens: UsageTokenBreakdown,
  kind: 'input' | 'cached' | 'output',
): number | null {
  const usesLongContext =
    longContextAppliesToWholeRow(price, override) &&
    thresholdTokens(price, override) !== undefined &&
    tokens.inputTokens > (thresholdTokens(price, override) ?? Number.POSITIVE_INFINITY)

  if (!usesLongContext) {
    if (kind === 'input') return price.inputUsdPerMillion
    if (kind === 'cached') return price.cachedInputUsdPerMillion ?? price.inputUsdPerMillion
    return price.outputUsdPerMillion
  }

  if (kind === 'input')
    return aboveThresholdRate(price, override, 'input') ?? price.inputUsdPerMillion
  if (kind === 'cached') {
    return (
      aboveThresholdRate(price, override, 'cached') ??
      price.cachedInputUsdPerMillion ??
      price.inputUsdPerMillion
    )
  }
  return aboveThresholdRate(price, override, 'output') ?? price.outputUsdPerMillion
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

function codexPriorityCostUsd(tokens: UsageTokenBreakdown, override: RateOverride): number | null {
  const cachedInputTokens = Math.min(tokens.cachedInputTokens, tokens.inputTokens)
  const billableInputTokens = Math.max(0, tokens.inputTokens - cachedInputTokens)
  const inputRate = override.priorityInputUsdPerMillion
  const cachedRate = override.priorityCachedInputUsdPerMillion
  const outputRate = override.priorityOutputUsdPerMillion
  if (inputRate === undefined || outputRate === undefined) return null

  return (
    (billableInputTokens / MILLION) * inputRate +
    (cachedInputTokens / MILLION) * (cachedRate ?? inputRate) +
    (tokens.outputTokens / MILLION) * outputRate
  )
}

export function estimateUsageCostUsd(
  tokens: UsageTokenBreakdown,
  price: UsagePricingEntry | null,
  options: { codexServiceTier?: 'priority' | null } = {},
): number | null {
  if (!price || !hasAnyRate(price)) return null

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
  const threshold = thresholdTokens(price, override)
  const cachedInputTokens = isAnthropic
    ? tokens.cachedInputTokens
    : Math.min(tokens.cachedInputTokens, tokens.inputTokens)
  const billableInputTokens = isAnthropic
    ? tokens.inputTokens
    : Math.max(0, tokens.inputTokens - cachedInputTokens)

  if (isAnthropic && threshold !== undefined) {
    const addTiered = (
      count: number,
      baseRate: number | null,
      aboveRate: number | null | undefined,
    ): void => {
      const value = addTieredCost(count, baseRate, aboveRate, threshold)
      if (value === null) return
      cost += value
      pricedAny = true
    }
    addTiered(
      billableInputTokens,
      price.inputUsdPerMillion,
      aboveThresholdRate(price, override, 'input'),
    )
    addTiered(
      cachedInputTokens,
      price.cachedInputUsdPerMillion,
      aboveThresholdRate(price, override, 'cached'),
    )
    addTiered(
      tokens.cacheCreationInputTokens,
      price.cacheCreationInputUsdPerMillion,
      aboveThresholdRate(price, override, 'cacheCreation'),
    )
    addTiered(
      tokens.outputTokens,
      price.outputUsdPerMillion,
      aboveThresholdRate(price, override, 'output'),
    )
  } else {
    add(
      billableInputTokens,
      isAnthropic ? price.inputUsdPerMillion : codexRate(price, override, tokens, 'input'),
    )
    add(
      cachedInputTokens,
      isAnthropic ? price.cachedInputUsdPerMillion : codexRate(price, override, tokens, 'cached'),
    )
    add(tokens.cacheCreationInputTokens, price.cacheCreationInputUsdPerMillion)
    add(
      tokens.outputTokens,
      isAnthropic ? price.outputUsdPerMillion : codexRate(price, override, tokens, 'output'),
    )
  }

  if (
    !isAnthropic &&
    options.codexServiceTier === 'priority' &&
    override &&
    tokens.inputTokens <= CODEX_PRIORITY_INPUT_TOKEN_LIMIT
  ) {
    const priorityCost = codexPriorityCostUsd(tokens, override)
    if (priorityCost !== null) {
      cost = pricedAny ? Math.max(cost, priorityCost) : priorityCost
      pricedAny = true
    }
  }

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
