export const USAGE_AGENTS = ['claude-code', 'codex'] as const
export const USAGE_REFRESH_FREQUENCIES = ['15m', '30m', '1h', '4h'] as const

export type UsageAgent = (typeof USAGE_AGENTS)[number]
export type UsageRefreshFrequency = (typeof USAGE_REFRESH_FREQUENCIES)[number]

export type UsageAttributionMethod =
  | 'turn_id'
  | 'session_time_window'
  | 'project_time_window'
  | 'unmatched'

export interface UsageTokenBreakdown {
  inputTokens: number
  cachedInputTokens: number
  cacheCreationInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export interface UsageTranscriptCandidate {
  sourceFileKey: string
  sourceFileBasename: string
  content: string
}

export interface UsagePersistableMeta {
  isSidechain?: boolean
  subagentType?: string
  attributionReason?: string
  sourceKind?: string
}

export interface UsageRecordFact {
  agent: UsageAgent
  sourceFileKey: string
  sourceRowKey: string
  sourceFileBasename: string
  sessionId?: string | null
  turnId?: string | null
  project?: string | null
  ts?: number | null
  model: string
  tokens: UsageTokenBreakdown
  attributionMethod: UsageAttributionMethod
  attributionConfidence: number
  meta?: UsagePersistableMeta | null
}

export interface UsageScanResult {
  records: UsageRecordFact[]
}

export interface UsageScanState {
  agent: UsageAgent
  sourceFileKey: string
  sourceFileBasename: string
  mtimeMs: number
  sizeBytes: number
  lastScannedAt: number
  lastRowKey?: string | null
}

export interface UsagePricingEntry {
  model: string
  provider: string
  inputUsdPerMillion: number | null
  cachedInputUsdPerMillion: number | null
  cacheCreationInputUsdPerMillion: number | null
  outputUsdPerMillion: number | null
  reasoningOutputUsdPerMillion: number | null
  source: string
  fetchedAt: string
  rawVersion: string
}

export type UsagePricingStatus =
  | 'fresh'
  | 'cached'
  | 'refresh_failed_with_cache'
  | 'refresh_failed_without_cache'
  | 'unknown_model'

export interface UsageSummaryArgs {
  periodDays: 7 | 30 | 90 | 365
  now?: Date
  agents?: UsageAgent[]
}

export interface UsageSummaryBreakdownRow {
  key: string
  tokens: UsageTokenBreakdown
  estimatedCostUsd: number | null
}

export interface UsageSummary {
  periodDays: 7 | 30 | 90 | 365
  tokens: UsageTokenBreakdown
  estimatedCostUsd: number | null
  pricingStatus: UsagePricingStatus
  byAgent: UsageSummaryBreakdownRow[]
  byModel: UsageSummaryBreakdownRow[]
  byProject: UsageSummaryBreakdownRow[]
}

export interface UsageRefreshResult {
  frequency: UsageRefreshFrequency
  scannedAt: number
  recordsFound: number
  recordsInserted: number
  pricingStatus: UsagePricingStatus
}

export function isUsageAgent(value: unknown): value is UsageAgent {
  return typeof value === 'string' && (USAGE_AGENTS as readonly string[]).includes(value)
}

export function isUsageRefreshFrequency(value: unknown): value is UsageRefreshFrequency {
  return (
    typeof value === 'string' && (USAGE_REFRESH_FREQUENCIES as readonly string[]).includes(value)
  )
}

export function sanitizeUsageMeta(meta: unknown): UsagePersistableMeta {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}

  const input = meta as Record<string, unknown>
  const sanitized: UsagePersistableMeta = {}

  if (typeof input.isSidechain === 'boolean') sanitized.isSidechain = input.isSidechain
  if (typeof input.subagentType === 'string') sanitized.subagentType = input.subagentType
  if (typeof input.attributionReason === 'string') {
    sanitized.attributionReason = input.attributionReason
  }
  if (typeof input.sourceKind === 'string') sanitized.sourceKind = input.sourceKind

  return sanitized
}

// Derived usage summaries are computed on read from token facts and pricing cache.
// Phase 07 does not persist summary rows.
