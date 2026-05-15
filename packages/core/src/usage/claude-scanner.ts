import type {
  UsageRecordFact,
  UsageScanResult,
  UsageTokenBreakdown,
  UsageTranscriptCandidate,
} from './types.js'

type JsonRecord = Record<string, unknown>

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

function tokenBreakdown(usage: JsonRecord): UsageTokenBreakdown {
  const inputTokens = asNumber(usage.input_tokens)
  const cachedInputTokens = asNumber(usage.cache_read_input_tokens)
  const cacheCreationInputTokens = asNumber(usage.cache_creation_input_tokens)
  const outputTokens = asNumber(usage.output_tokens)
  const reasoningOutputTokens = asNumber(usage.reasoning_output_tokens)

  return {
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens:
      inputTokens +
      cachedInputTokens +
      cacheCreationInputTokens +
      outputTokens +
      reasoningOutputTokens,
  }
}

function stableRowKey(record: JsonRecord, message: JsonRecord, rowIndex: number): string {
  const sessionId = asString(record.sessionId)
  const requestId = asString(record.requestId)
  const messageId = asString(message.id)
  if (sessionId && requestId && messageId) return `${sessionId}:${requestId}:${messageId}`

  const timestamp = asString(record.timestamp)
  if (sessionId && requestId && timestamp)
    return `${sessionId}:${requestId}:${timestamp}:${rowIndex}`
  if (sessionId && messageId && timestamp)
    return `${sessionId}:${messageId}:${timestamp}:${rowIndex}`

  return `row:${rowIndex}`
}

function scanRecord(
  candidate: UsageTranscriptCandidate,
  record: JsonRecord,
  rowIndex: number,
  seenRows: Set<string>,
): UsageRecordFact | null {
  if (asString(record.type) !== 'assistant') return null

  const message = asObject(record.message)
  const usage = asObject(message?.usage)
  if (!message || !usage) return null

  const rowKey = stableRowKey(record, message, rowIndex)
  if (seenRows.has(rowKey)) return null
  seenRows.add(rowKey)

  const meta: UsageRecordFact['meta'] = { sourceKind: 'claude-assistant-usage' }
  if (typeof record.isSidechain === 'boolean') meta.isSidechain = record.isSidechain
  if (typeof record.subagentType === 'string') meta.subagentType = record.subagentType

  return {
    agent: 'claude-code',
    sourceFileKey: candidate.sourceFileKey,
    sourceRowKey: rowKey,
    sourceFileBasename: candidate.sourceFileBasename,
    sessionId: asString(record.sessionId),
    turnId: null,
    project: null,
    ts: parseTimestamp(record.timestamp),
    model: asString(message.model) ?? asString(record.model) ?? 'unknown',
    tokens: tokenBreakdown(usage),
    attributionMethod: 'unmatched',
    attributionConfidence: 0,
    meta,
  }
}

export function scanClaudeUsageTranscript(candidate: UsageTranscriptCandidate): UsageScanResult {
  const records: UsageRecordFact[] = []
  const seenRows = new Set<string>()

  for (const [index, line] of candidate.content.split('\n').entries()) {
    if (!line.trim()) continue

    try {
      const record = asObject(JSON.parse(line))
      if (!record) continue

      const fact = scanRecord(candidate, record, index, seenRows)
      if (fact) records.push(fact)
    } catch {
      // Local Claude JSONL files can contain partial or malformed rows; skip non-usage rows.
    }
  }

  return { records }
}

export function scanClaudeUsageTranscripts(
  candidates: UsageTranscriptCandidate[],
): UsageScanResult {
  const records: UsageRecordFact[] = []
  const seenRows = new Set<string>()

  for (const candidate of candidates) {
    for (const record of scanClaudeUsageTranscript(candidate).records) {
      const key = `${record.sourceFileKey}:${record.sourceRowKey}`
      if (seenRows.has(key)) continue
      seenRows.add(key)
      records.push(record)
    }
  }

  return { records }
}
