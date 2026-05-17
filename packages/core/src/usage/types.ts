export const USAGE_AGENTS = ['claude-code', 'codex'] as const
export const USAGE_REFRESH_FREQUENCIES = ['manual', '1m', '2m', '5m', '15m', '30m'] as const

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
  sourcePath?: string
  content: string
  rowIndexOffset?: number
  scanContext?: UsageScannerContext | null
}

export interface UsagePersistableMeta {
  isSidechain?: boolean
  subagentType?: string
  claudePathRole?: 'parent' | 'subagent'
  attributionReason?: string
  sourceKind?: string
  codexServiceTier?: 'priority'
  projectResolutionKind?: 'git' | 'local' | 'wrapper_workspace' | 'generated_parent'
  projectResolutionSource?: string
  wrapperName?: string
  wrapperWorkspaceId?: string
  wrapperWorkspaceName?: string
  wrapperWorkspaceSlug?: string
  wrapperSessionId?: string
  wrapperSessionName?: string
  wrapperSessionMatch?: 'cwd' | 'sdk_session_id'
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
  scanContext?: UsageScannerContext | null
}

export interface UsageScanState {
  agent: UsageAgent
  sourceFileKey: string
  sourceFileBasename: string
  mtimeMs: number
  sizeBytes: number
  lastScannedAt: number
  lastRowKey?: string | null
  parsedBytes?: number | null
  scanContext?: UsageScannerContext | null
}

export interface UsageScannerContext {
  rowIndexOffset?: number
  codex?: UsageCodexScannerContext | null
}

export interface UsageCodexScannerContext {
  model?: string | null
  sessionId?: string | null
  turnId?: string | null
  project?: string | null
  previousTotal?: UsageTokenBreakdown | null
  inheritedTotal?: UsageTokenBreakdown | null
  remainingInheritedTotal?: UsageTokenBreakdown | null
}

export interface UsagePricingEntry {
  model: string
  provider: string
  inputUsdPerMillion: number | null
  cachedInputUsdPerMillion: number | null
  cacheCreationInputUsdPerMillion: number | null
  outputUsdPerMillion: number | null
  reasoningOutputUsdPerMillion: number | null
  thresholdTokens?: number | null
  inputUsdPerMillionAboveThreshold?: number | null
  cachedInputUsdPerMillionAboveThreshold?: number | null
  cacheCreationInputUsdPerMillionAboveThreshold?: number | null
  outputUsdPerMillionAboveThreshold?: number | null
  longContextAppliesToWholeRow?: boolean | null
  source: string
  fetchedAt: string
  rawVersion: string
}

export type UsagePriceMatchKind = 'exact' | 'provider-prefix' | 'alias' | 'normalized' | 'unknown'

export interface UsagePriceResolution {
  requestedModel: string
  matchedModel: string | null
  price: UsagePricingEntry | null
  matchKind: UsagePriceMatchKind
  source: string | null
  reason: string
  candidateCount: number
}

export type UsagePricingStatus =
  | 'fresh'
  | 'cached'
  | 'refresh_failed_with_cache'
  | 'refresh_failed_without_cache'

export interface UsageSummaryArgs {
  periodDays: 7 | 30 | 90 | 365
  now?: Date
  agents?: UsageAgent[]
  prices?: UsagePricingEntry[]
  pricingStatus?: UsagePricingStatus
}

export interface UsageSummaryBreakdownRow {
  key: string
  label: string
  tokens: UsageTokenBreakdown
  totalTokens: number
  estimatedCostUsd: number | null
  unknownCostTokens: number
  recordCount: number
}

export interface UsageSummaryTotals {
  totalTokens: number
  estimatedCostUsd: number | null
  unknownCostTokens: number
  recordCount: number
}

export interface UsageDailySummaryRow extends UsageSummaryTotals {
  date: string
  tokens: UsageTokenBreakdown
}

export interface UsageProjectModelMatrixCell extends UsageSummaryTotals {
  project: string
  model: string
}

export interface UsageEfficiencyTotals {
  durationSec: number
  turnCount: number
  costPerHourUsd: number | null
  costPerTurnUsd: number | null
  tokensPerTurn: number | null
}

export interface UsageEfficiencyDailyRow extends UsageEfficiencyTotals {
  date: string
}

export interface UsageEfficiencyBreakdownRow extends UsageEfficiencyTotals {
  key: string
  label: string
  totalTokens: number
  estimatedCostUsd: number | null
}

export interface UsageEfficiencySummary {
  totals: UsageEfficiencyTotals
  daily: UsageEfficiencyDailyRow[]
  byAgent: UsageEfficiencyBreakdownRow[]
  byModel: UsageEfficiencyBreakdownRow[]
  byProject: UsageEfficiencyBreakdownRow[]
}

export interface UsageMetricPeriodComparison {
  previousValue: number | null
  delta: number | null
  deltaRatio: number | null
}

export interface UsagePeriodComparison {
  estimatedCostUsd: UsageMetricPeriodComparison
  costPerHourUsd: UsageMetricPeriodComparison
}

export interface UsageAttributionSummaryRow extends UsageSummaryTotals {
  method: UsageAttributionMethod
}

export interface UsageDataQualitySummary {
  assignedRecordCount: number
  unassigned: UsageSummaryTotals
  unknownPrice: UsageSummaryTotals
  attribution: UsageAttributionSummaryRow[]
}

export interface UsageAuditRow extends UsageSummaryTotals {
  key: string
  label: string
  model?: string | null
  project?: string | null
  attributionMethod?: UsageAttributionMethod
}

export interface UsageAvailableFilters {
  agents: UsageAgent[]
  models: string[]
  projects: string[]
}

export interface UsageSummary {
  periodDays: 7 | 30 | 90 | 365
  totals: UsageSummaryTotals
  daily: UsageDailySummaryRow[]
  pricingStatus: UsagePricingStatus
  tokenBreakdown: UsageTokenBreakdown
  byAgent: UsageSummaryBreakdownRow[]
  byModel: UsageSummaryBreakdownRow[]
  byProject: UsageSummaryBreakdownRow[]
  projectModelMatrix: UsageProjectModelMatrixCell[]
  efficiency: UsageEfficiencySummary
  periodCompare?: UsagePeriodComparison
  dataQuality: UsageDataQualitySummary
  auditRows: UsageAuditRow[]
  availableFilters: UsageAvailableFilters
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
  if (input.claudePathRole === 'parent' || input.claudePathRole === 'subagent') {
    sanitized.claudePathRole = input.claudePathRole
  }
  if (typeof input.attributionReason === 'string') {
    sanitized.attributionReason = input.attributionReason
  }
  if (typeof input.sourceKind === 'string') sanitized.sourceKind = input.sourceKind
  if (input.codexServiceTier === 'priority') sanitized.codexServiceTier = 'priority'
  if (
    input.projectResolutionKind === 'git' ||
    input.projectResolutionKind === 'local' ||
    input.projectResolutionKind === 'wrapper_workspace' ||
    input.projectResolutionKind === 'generated_parent'
  ) {
    sanitized.projectResolutionKind = input.projectResolutionKind
  }
  if (typeof input.projectResolutionSource === 'string') {
    sanitized.projectResolutionSource = input.projectResolutionSource
  }
  if (typeof input.wrapperName === 'string') sanitized.wrapperName = input.wrapperName
  if (typeof input.wrapperWorkspaceId === 'string') {
    sanitized.wrapperWorkspaceId = input.wrapperWorkspaceId
  }
  if (typeof input.wrapperWorkspaceName === 'string') {
    sanitized.wrapperWorkspaceName = input.wrapperWorkspaceName
  }
  if (typeof input.wrapperWorkspaceSlug === 'string') {
    sanitized.wrapperWorkspaceSlug = input.wrapperWorkspaceSlug
  }
  if (typeof input.wrapperSessionId === 'string')
    sanitized.wrapperSessionId = input.wrapperSessionId
  if (typeof input.wrapperSessionName === 'string') {
    sanitized.wrapperSessionName = input.wrapperSessionName
  }
  if (input.wrapperSessionMatch === 'cwd' || input.wrapperSessionMatch === 'sdk_session_id') {
    sanitized.wrapperSessionMatch = input.wrapperSessionMatch
  }

  return sanitized
}

// Derived usage summaries are computed on read from token facts and pricing cache.
// Phase 07 does not persist summary rows.
