import type {
  UsageRecordFact,
  UsageScanResult,
  UsageTokenBreakdown,
  UsageTranscriptCandidate,
} from './types.js'

type JsonRecord = Record<string, unknown>

type ClaudeScannedRecord = {
  record: UsageRecordFact
  inFileKey: string | null
  canonicalKey: string | null
  tokenTotal: number
  sourcePath: string
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

function* contentLines(content: string, indexOffset = 0): Generator<[number, string]> {
  let index = indexOffset
  let start = 0
  while (start <= content.length) {
    const end = content.indexOf('\n', start)
    const lineEnd = end === -1 ? content.length : end
    yield [index, content.slice(start, lineEnd)]
    index += 1
    if (end === -1) break
    start = end + 1
  }
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

function hasUsageTokens(tokens: UsageTokenBreakdown): boolean {
  return tokens.totalTokens > 0
}

function toSlashPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function claudePathRole(candidate: UsageTranscriptCandidate): 'parent' | 'subagent' {
  return candidate.sourcePath && toSlashPath(candidate.sourcePath).includes('/subagents/')
    ? 'subagent'
    : 'parent'
}

function stableRowKey(record: JsonRecord, message: JsonRecord, rowIndex: number): string {
  const sessionId = sessionIdFromRecord(record, message)
  const requestId = requestIdFromRecord(record)
  const messageId = asString(message.id)
  if (sessionId && messageId && requestId) return `${sessionId}:${messageId}:${requestId}`

  const timestamp = asString(record.timestamp)
  if (sessionId && requestId && timestamp)
    return `${sessionId}:${requestId}:${timestamp}:${rowIndex}`
  if (sessionId && messageId && timestamp)
    return `${sessionId}:${messageId}:${timestamp}:${rowIndex}`

  return `row:${rowIndex}`
}

function inFileDedupeKey(record: JsonRecord, message: JsonRecord): string | null {
  const requestId = requestIdFromRecord(record)
  const messageId = asString(message.id)
  return requestId && messageId ? `${messageId}:${requestId}` : null
}

function sessionIdFromRecord(record: JsonRecord, message: JsonRecord): string | null {
  const recordMetadata = asObject(record.metadata)
  const messageMetadata = asObject(message.metadata)
  return (
    asString(record.sessionId) ??
    asString(record.session_id) ??
    asString(recordMetadata?.sessionId) ??
    asString(recordMetadata?.session_id) ??
    asString(messageMetadata?.sessionId) ??
    asString(messageMetadata?.session_id)
  )
}

function requestIdFromRecord(record: JsonRecord): string | null {
  return asString(record.requestId) ?? asString(record.request_id)
}

function canonicalDedupeKey(record: UsageRecordFact): string | null {
  const parts = record.sourceRowKey.split(':')
  return record.sessionId && parts.length === 3 && parts[0] === record.sessionId
    ? record.sourceRowKey
    : null
}

function shouldReplaceCanonical(
  existing: ClaudeScannedRecord,
  candidate: ClaudeScannedRecord,
): boolean {
  const existingSidechain = existing.record.meta?.isSidechain === true
  const candidateSidechain = candidate.record.meta?.isSidechain === true
  if (existingSidechain !== candidateSidechain) return !candidateSidechain

  const existingRole = existing.record.meta?.claudePathRole
  const candidateRole = candidate.record.meta?.claudePathRole
  if (existingRole !== candidateRole) return candidateRole === 'parent'

  return candidate.sourcePath < existing.sourcePath
}

function scanRecord(
  candidate: UsageTranscriptCandidate,
  record: JsonRecord,
  rowIndex: number,
): ClaudeScannedRecord | null {
  if (asString(record.type) !== 'assistant') return null

  const message = asObject(record.message)
  const usage = asObject(message?.usage)
  if (!message || !usage) return null

  const rowKey = stableRowKey(record, message, rowIndex)
  const model = asString(message.model) ?? asString(record.model) ?? 'unknown'
  const tokens = tokenBreakdown(usage)
  if (model === '<synthetic>' || !hasUsageTokens(tokens)) return null

  const meta: UsageRecordFact['meta'] = {
    sourceKind: 'claude-assistant-usage',
    claudePathRole: claudePathRole(candidate),
  }
  if (typeof record.isSidechain === 'boolean') meta.isSidechain = record.isSidechain
  if (typeof record.subagentType === 'string') meta.subagentType = record.subagentType

  const fact: UsageRecordFact = {
    agent: 'claude-code',
    sourceFileKey: candidate.sourceFileKey,
    sourceRowKey: rowKey,
    sourceFileBasename: candidate.sourceFileBasename,
    sessionId: sessionIdFromRecord(record, message),
    turnId: null,
    project: asString(record.cwd),
    ts: parseTimestamp(record.timestamp),
    model,
    tokens,
    attributionMethod: 'unmatched',
    attributionConfidence: 0,
    meta,
  }

  return {
    record: fact,
    inFileKey: inFileDedupeKey(record, message),
    canonicalKey: canonicalDedupeKey(fact),
    tokenTotal: tokens.totalTokens,
    sourcePath: candidate.sourcePath ?? candidate.sourceFileKey,
  }
}

export function scanClaudeUsageTranscript(candidate: UsageTranscriptCandidate): UsageScanResult {
  const records: ClaudeScannedRecord[] = []
  const keyedRecords = new Map<string, ClaudeScannedRecord>()

  for (const [index, line] of contentLines(candidate.content, candidate.rowIndexOffset ?? 0)) {
    if (!line.trim()) continue
    if (!line.includes('"usage"')) continue

    try {
      const record = asObject(JSON.parse(line))
      if (!record) continue

      const fact = scanRecord(candidate, record, index)
      if (!fact) continue
      if (fact.inFileKey) {
        const existing = keyedRecords.get(fact.inFileKey)
        if (!existing) {
          keyedRecords.set(fact.inFileKey, fact)
          records.push(fact)
        } else {
          keyedRecords.set(fact.inFileKey, fact)
          records[records.indexOf(existing)] = fact
        }
      } else {
        records.push(fact)
      }
    } catch {
      // Local Claude JSONL files can contain partial or malformed rows; skip non-usage rows.
    }
  }

  return { records: records.map((entry) => entry.record) }
}

export function scanClaudeUsageTranscripts(
  candidates: UsageTranscriptCandidate[],
): UsageScanResult {
  const records: ClaudeScannedRecord[] = []
  const keyedRecords = new Map<string, ClaudeScannedRecord>()

  for (const candidate of candidates) {
    const scanned = scanClaudeUsageTranscript(candidate).records.map((record) => ({
      record,
      inFileKey: null,
      canonicalKey: canonicalDedupeKey(record),
      tokenTotal: record.tokens.totalTokens,
      sourcePath: candidate.sourcePath ?? candidate.sourceFileKey,
    }))
    for (const fact of scanned) {
      if (fact.canonicalKey) {
        const existing = keyedRecords.get(fact.canonicalKey)
        if (!existing) {
          keyedRecords.set(fact.canonicalKey, fact)
          records.push(fact)
        } else if (shouldReplaceCanonical(existing, fact)) {
          keyedRecords.set(fact.canonicalKey, fact)
          records[records.indexOf(existing)] = fact
        }
      } else {
        records.push(fact)
      }
    }
  }

  return { records: records.map((entry) => entry.record) }
}
