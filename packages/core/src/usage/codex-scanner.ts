import type {
  UsageRecordFact,
  UsageScanResult,
  UsageTokenBreakdown,
  UsageTranscriptCandidate,
} from './types.js'

type JsonRecord = Record<string, unknown>

interface ScannerState {
  model: string
  previousTotal: UsageTokenBreakdown | null
  seenRows: Set<string>
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function parseTimestamp(value: unknown): number | null {
  const timestamp = asString(value)
  if (!timestamp) return null

  const seconds = new Date(timestamp).getTime() / 1000
  return Number.isFinite(seconds) ? seconds : null
}

function isTokenRow(record: JsonRecord, payload: JsonRecord | null): boolean {
  return asString(record.type) === 'token_count' || asString(payload?.type) === 'token_count'
}

function tokenObject(record: JsonRecord, payload: JsonRecord | null, key: string): JsonRecord | null {
  return asObject(record[key]) ?? asObject(payload?.[key])
}

function tokenBreakdown(input: JsonRecord): UsageTokenBreakdown {
  const inputTokens = asNumber(input.input_tokens)
  const cachedInputTokens = asNumber(input.cached_input_tokens)
  const cacheCreationInputTokens = asNumber(input.cache_creation_input_tokens)
  const outputTokens = asNumber(input.output_tokens)
  const reasoningOutputTokens = asNumber(input.reasoning_output_tokens)
  const reportedTotal = asNumber(input.total_tokens)
  const totalTokens = reportedTotal || inputTokens + outputTokens + reasoningOutputTokens

  return {
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
  }
}

function subtractTokenBreakdown(
  current: UsageTokenBreakdown,
  previous: UsageTokenBreakdown | null,
): UsageTokenBreakdown {
  if (!previous) return current

  return {
    inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
    cachedInputTokens: Math.max(0, current.cachedInputTokens - previous.cachedInputTokens),
    cacheCreationInputTokens: Math.max(
      0,
      current.cacheCreationInputTokens - previous.cacheCreationInputTokens,
    ),
    outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
    reasoningOutputTokens: Math.max(0, current.reasoningOutputTokens - previous.reasoningOutputTokens),
    totalTokens: Math.max(0, current.totalTokens - previous.totalTokens),
  }
}

function stableRowKey(
  candidate: UsageTranscriptCandidate,
  record: JsonRecord,
  payload: JsonRecord | null,
  rowIndex: number,
): string {
  const explicit =
    asString(record.source_row_key) ??
    asString(payload?.source_row_key) ??
    asString(record.id) ??
    asString(payload?.id) ??
    asString(record.message_id) ??
    asString(payload?.message_id) ??
    asString(record.item_id) ??
    asString(payload?.item_id)
  if (explicit) return explicit

  const turnId = asString(record.turn_id) ?? asString(payload?.turn_id)
  const timestamp = asString(record.timestamp) ?? asString(payload?.timestamp)
  if (turnId && timestamp) return `${turnId}:${timestamp}:${rowIndex}`

  return `${candidate.sourceFileKey}:${rowIndex}`
}

function scanRecord(
  candidate: UsageTranscriptCandidate,
  record: JsonRecord,
  rowIndex: number,
  state: ScannerState,
): UsageRecordFact | null {
  const payload = asObject(record.payload)
  const rowModel = asString(record.model) ?? asString(payload?.model)
  if (rowModel) state.model = rowModel
  if (!isTokenRow(record, payload)) return null

  const totalUsage = tokenObject(record, payload, 'total_token_usage')
  const lastUsage = tokenObject(record, payload, 'last_token_usage')
  if (!lastUsage && !totalUsage) return null

  const rowKey = stableRowKey(candidate, record, payload, rowIndex)
  if (state.seenRows.has(rowKey)) return null
  state.seenRows.add(rowKey)

  const cumulativeTokens = totalUsage ? tokenBreakdown(totalUsage) : null
  const tokens = lastUsage
    ? tokenBreakdown(lastUsage)
    : subtractTokenBreakdown(cumulativeTokens as UsageTokenBreakdown, state.previousTotal)
  if (cumulativeTokens) state.previousTotal = cumulativeTokens

  return {
    agent: 'codex',
    sourceFileKey: candidate.sourceFileKey,
    sourceRowKey: rowKey,
    sourceFileBasename: candidate.sourceFileBasename,
    sessionId: asString(record.session_id) ?? asString(payload?.session_id),
    turnId: asString(record.turn_id) ?? asString(payload?.turn_id),
    project: null,
    ts: parseTimestamp(record.timestamp ?? payload?.timestamp),
    model: rowModel ?? state.model,
    tokens,
    attributionMethod: 'unmatched',
    attributionConfidence: 0,
    meta: { sourceKind: 'codex-token-count' },
  }
}

export function scanCodexUsageTranscript(candidate: UsageTranscriptCandidate): UsageScanResult {
  const records: UsageRecordFact[] = []
  const state: ScannerState = { model: 'unknown', previousTotal: null, seenRows: new Set() }

  for (const [index, line] of candidate.content.split('\n').entries()) {
    if (!line.trim()) continue

    try {
      const record = asObject(JSON.parse(line))
      if (!record) continue

      const fact = scanRecord(candidate, record, index, state)
      if (fact) records.push(fact)
    } catch {
      // Local Codex logs may include diagnostics mixed into JSONL; those rows are not usage facts.
    }
  }

  return { records }
}

export function scanCodexUsageTranscripts(
  candidates: UsageTranscriptCandidate[],
): UsageScanResult {
  const records: UsageRecordFact[] = []
  const seenRows = new Set<string>()

  for (const candidate of candidates) {
    for (const record of scanCodexUsageTranscript(candidate).records) {
      const key = `${record.sourceFileKey}:${record.sourceRowKey}`
      if (seenRows.has(key)) continue
      seenRows.add(key)
      records.push(record)
    }
  }

  return { records }
}
