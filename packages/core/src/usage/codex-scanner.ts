import { parseGitRemoteUrl } from '../project.js'
import type {
  UsageCodexScannerContext,
  UsageRecordFact,
  UsageScanResult,
  UsageTokenBreakdown,
  UsageTranscriptCandidate,
} from './types.js'

type JsonRecord = Record<string, unknown>

interface ScannerState {
  model: string | null
  modelProvider: string | null
  sessionId: string | null
  turnId: string | null
  project: string | null
  previousTotal: UsageTokenBreakdown | null
  inheritedTotal: UsageTokenBreakdown | null
  remainingInheritedTotal: UsageTokenBreakdown | null
  seenRows: Set<string>
}

interface SessionMetadata {
  sessionId: string | null
  forkedFromId: string | null
  forkTimestamp: string | null
}

interface TokenSnapshot {
  timestamp: string
  ts: number | null
  totals: UsageTokenBreakdown
}

const LEGACY_FALLBACK_MODEL = 'gpt-5'
const EMPTY_TOKENS: UsageTokenBreakdown = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
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

function* lineRecords(
  content: string,
  shouldParseLine: (line: string) => boolean = () => true,
  indexOffset = 0,
): Generator<{ record: JsonRecord; index: number }> {
  for (const [index, line] of contentLines(content, indexOffset)) {
    if (!line.trim()) continue
    if (!shouldParseLine(line)) continue
    try {
      const record = asObject(JSON.parse(line))
      if (record) yield { record, index }
    } catch {
      // Local Codex logs may include diagnostics mixed into JSONL; those rows are not usage facts.
    }
  }
}

function lineMightContainCodexContext(line: string): boolean {
  return (
    line.includes('"token_count"') ||
    line.includes('"session_meta"') ||
    line.includes('"turn_context"') ||
    line.includes('"task_started"')
  )
}

function isTokenRow(record: JsonRecord, payload: JsonRecord | null): boolean {
  return asString(record.type) === 'token_count' || asString(payload?.type) === 'token_count'
}

function tokenObject(
  record: JsonRecord,
  payload: JsonRecord | null,
  info: JsonRecord | null,
  key: string,
): JsonRecord | null {
  return asObject(record[key]) ?? asObject(payload?.[key]) ?? asObject(info?.[key])
}

function normalizeCodexModel(model: string): string {
  const trimmed = model.trim()
  const withoutProvider = trimmed.startsWith('openai/') ? trimmed.slice('openai/'.length) : trimmed
  const dated = withoutProvider.match(/^(gpt-[\w.-]+)-\d{4}-\d{2}-\d{2}$/)
  return dated?.[1] ?? withoutProvider
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase()
}

function modelProviderFromRecord(
  record: JsonRecord,
  payload: JsonRecord | null,
  info: JsonRecord | null,
): string | null {
  const provider =
    asString(record.model_provider) ??
    asString(record.modelProvider) ??
    asString(record.provider) ??
    asString(payload?.model_provider) ??
    asString(payload?.modelProvider) ??
    asString(payload?.provider) ??
    asString(info?.model_provider) ??
    asString(info?.modelProvider) ??
    asString(info?.provider)
  return provider ? normalizeProvider(provider) : null
}

function projectFromRecord(
  record: JsonRecord,
  payload: JsonRecord | null,
  info: JsonRecord | null,
): string | null {
  const git = asObject(record.git) ?? asObject(payload?.git) ?? asObject(info?.git)
  const remoteUrl =
    asString(git?.repository_url) ??
    asString(git?.repositoryUrl) ??
    asString(git?.remote_url) ??
    asString(git?.remoteUrl)
  const remoteProject = parseGitRemoteUrl(remoteUrl)
  if (remoteProject) return remoteProject

  return (
    asString(record.cwd) ??
    asString(payload?.cwd) ??
    asString(info?.cwd) ??
    asString(record.project) ??
    asString(payload?.project) ??
    asString(info?.project)
  )
}

function isAbsolutePathLike(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

function setStateProject(state: ScannerState, project: string | null): void {
  if (!project) return
  if (state.project && !isAbsolutePathLike(state.project) && isAbsolutePathLike(project)) return
  state.project = project
}

function tokenBreakdown(input: JsonRecord): UsageTokenBreakdown {
  const inputTokens = asNumber(input.input_tokens)
  const cachedInputTokens = Math.min(
    asNumber(input.cached_input_tokens ?? input.cache_read_input_tokens),
    inputTokens,
  )
  const outputTokens = asNumber(input.output_tokens)
  const reasoningOutputTokens = asNumber(input.reasoning_output_tokens)

  return {
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens: 0,
    outputTokens,
    reasoningOutputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

function addTokenBreakdown(
  left: UsageTokenBreakdown | null,
  right: UsageTokenBreakdown,
): UsageTokenBreakdown {
  const base = left ?? EMPTY_TOKENS
  return {
    inputTokens: base.inputTokens + right.inputTokens,
    cachedInputTokens: base.cachedInputTokens + right.cachedInputTokens,
    cacheCreationInputTokens: base.cacheCreationInputTokens + right.cacheCreationInputTokens,
    outputTokens: base.outputTokens + right.outputTokens,
    reasoningOutputTokens: base.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: base.totalTokens + right.totalTokens,
  }
}

function subtractTokenBreakdown(
  current: UsageTokenBreakdown,
  previous: UsageTokenBreakdown | null,
): UsageTokenBreakdown {
  const base = previous ?? EMPTY_TOKENS
  const inputTokens = Math.max(0, current.inputTokens - base.inputTokens)
  const outputTokens = Math.max(0, current.outputTokens - base.outputTokens)
  return {
    inputTokens,
    cachedInputTokens: Math.max(0, current.cachedInputTokens - base.cachedInputTokens),
    cacheCreationInputTokens: Math.max(
      0,
      current.cacheCreationInputTokens - base.cacheCreationInputTokens,
    ),
    outputTokens,
    reasoningOutputTokens: Math.max(0, current.reasoningOutputTokens - base.reasoningOutputTokens),
    totalTokens: inputTokens + outputTokens,
  }
}

function hasTokenDelta(tokens: UsageTokenBreakdown): boolean {
  return (
    tokens.inputTokens > 0 ||
    tokens.cachedInputTokens > 0 ||
    tokens.outputTokens > 0 ||
    tokens.reasoningOutputTokens > 0
  )
}

function sessionMetadataFromRecord(record: JsonRecord): SessionMetadata | null {
  if (asString(record.type) !== 'session_meta') return null
  const payload = asObject(record.payload)
  return {
    sessionId:
      asString(payload?.session_id) ??
      asString(payload?.sessionId) ??
      asString(payload?.id) ??
      asString(record.session_id) ??
      asString(record.sessionId) ??
      asString(record.id),
    forkedFromId:
      asString(payload?.forked_from_id) ??
      asString(payload?.forkedFromId) ??
      asString(payload?.parent_session_id) ??
      asString(payload?.parentSessionId),
    forkTimestamp: asString(payload?.timestamp) ?? asString(record.timestamp),
  }
}

function readSessionMetadata(candidate: UsageTranscriptCandidate): SessionMetadata {
  for (const { record } of lineRecords(candidate.content, (line) =>
    line.includes('"session_meta"'),
  )) {
    const metadata = sessionMetadataFromRecord(record)
    if (metadata) return metadata
  }
  return { sessionId: null, forkedFromId: null, forkTimestamp: null }
}

function tokenSnapshotRecords(candidate: UsageTranscriptCandidate): {
  sessionId: string | null
  snapshots: TokenSnapshot[]
} {
  let sessionId: string | null = null
  let previousTotal: UsageTokenBreakdown | null = null
  const snapshots: TokenSnapshot[] = []

  for (const { record } of lineRecords(
    candidate.content,
    (line) => line.includes('"session_meta"') || line.includes('"token_count"'),
  )) {
    const metadata = sessionMetadataFromRecord(record)
    if (metadata?.sessionId && !sessionId) {
      sessionId = metadata.sessionId
      continue
    }

    if (asString(record.type) !== 'event_msg') continue
    const payload = asObject(record.payload)
    if (asString(payload?.type) !== 'token_count') continue
    const info = asObject(payload?.info)
    const timestamp = asString(record.timestamp)
    if (!info || !timestamp) continue

    const totalUsage = tokenObject(record, payload, info, 'total_token_usage')
    const lastUsage = tokenObject(record, payload, info, 'last_token_usage')
    const totals: UsageTokenBreakdown | null = totalUsage
      ? tokenBreakdown(totalUsage)
      : lastUsage
        ? addTokenBreakdown(previousTotal, tokenBreakdown(lastUsage))
        : null
    if (!totals) continue

    previousTotal = totals
    snapshots.push({ timestamp, ts: parseTimestamp(timestamp), totals })
  }

  return { sessionId, snapshots }
}

function stableRowKey(
  candidate: UsageTranscriptCandidate,
  record: JsonRecord,
  payload: JsonRecord | null,
  info: JsonRecord | null,
  rowIndex: number,
): string {
  const explicitSourceRowKey =
    asString(record.source_row_key) ??
    asString(payload?.source_row_key) ??
    asString(info?.source_row_key)
  if (explicitSourceRowKey) return explicitSourceRowKey

  const turnId = asString(record.turn_id) ?? asString(payload?.turn_id) ?? asString(info?.turn_id)
  const timestamp =
    asString(record.timestamp) ?? asString(payload?.timestamp) ?? asString(info?.timestamp)
  if (turnId && timestamp) return `${turnId}:${timestamp}:${rowIndex}`

  return `${candidate.sourceFileKey}:${rowIndex}`
}

function consumeInheritedLastDelta(
  rawDelta: UsageTokenBreakdown,
  state: ScannerState,
): UsageTokenBreakdown {
  const remaining = state.remainingInheritedTotal
  if (!remaining) return rawDelta

  const adjusted = subtractTokenBreakdown(rawDelta, remaining)
  const nextRemaining = subtractTokenBreakdown(remaining, rawDelta)
  state.remainingInheritedTotal = hasTokenDelta(nextRemaining) ? nextRemaining : null
  return adjusted
}

function scanRecord(
  candidate: UsageTranscriptCandidate,
  record: JsonRecord,
  rowIndex: number,
  state: ScannerState,
): UsageRecordFact | null {
  const type = asString(record.type)
  const payload = asObject(record.payload)
  const info = asObject(payload?.info)
  const metadata = sessionMetadataFromRecord(record)
  if (metadata) {
    if (metadata.sessionId) state.sessionId = metadata.sessionId
    state.modelProvider = modelProviderFromRecord(record, payload, info) ?? state.modelProvider
    setStateProject(state, projectFromRecord(record, payload, info))
    return null
  }

  if (type === 'turn_context') {
    const rowModel = asString(payload?.model) ?? asString(asObject(payload?.info)?.model)
    if (rowModel) state.model = rowModel
    state.modelProvider = modelProviderFromRecord(record, payload, info) ?? state.modelProvider
    const turnId =
      asString(payload?.turn_id) ?? asString(payload?.turnId) ?? asString(record.turn_id)
    if (turnId) state.turnId = turnId
    setStateProject(state, projectFromRecord(record, payload, info))
    return null
  }

  if (type === 'event_msg' && asString(payload?.type) === 'task_started') {
    const turnId = asString(payload?.turn_id) ?? asString(payload?.turnId) ?? asString(payload?.id)
    if (turnId) state.turnId = turnId
    setStateProject(state, projectFromRecord(record, payload, info))
    return null
  }

  const rowSessionId =
    asString(record.session_id) ??
    asString(record.sessionId) ??
    asString(payload?.session_id) ??
    asString(payload?.sessionId) ??
    asString(info?.session_id) ??
    asString(info?.sessionId)
  if (rowSessionId) state.sessionId = rowSessionId
  const rowTurnId =
    asString(record.turn_id) ??
    asString(record.turnId) ??
    asString(payload?.turn_id) ??
    asString(payload?.turnId) ??
    asString(payload?.id) ??
    asString(info?.turn_id) ??
    asString(info?.turnId) ??
    asString(info?.id)
  if (rowTurnId) state.turnId = rowTurnId
  const rowProject = projectFromRecord(record, payload, info)
  setStateProject(state, rowProject)
  const rowModelProvider = modelProviderFromRecord(record, payload, info)
  if (rowModelProvider) state.modelProvider = rowModelProvider
  if (!isTokenRow(record, payload)) return null

  const totalUsage = tokenObject(record, payload, info, 'total_token_usage')
  const lastUsage = tokenObject(record, payload, info, 'last_token_usage')
  if (!lastUsage && !totalUsage) return null

  const rowKey = stableRowKey(candidate, record, payload, info, rowIndex)
  if (state.seenRows.has(rowKey)) return null
  state.seenRows.add(rowKey)

  let tokens: UsageTokenBreakdown
  if (totalUsage) {
    const rawTotal = tokenBreakdown(totalUsage)
    const currentTotal = state.inheritedTotal
      ? subtractTokenBreakdown(rawTotal, state.inheritedTotal)
      : rawTotal
    tokens = subtractTokenBreakdown(currentTotal, state.previousTotal)
    state.previousTotal = currentTotal
    state.remainingInheritedTotal = null
  } else {
    tokens = consumeInheritedLastDelta(tokenBreakdown(lastUsage as JsonRecord), state)
    state.previousTotal = addTokenBreakdown(state.previousTotal, tokens)
  }

  if (!hasTokenDelta(tokens)) return null

  const rowModel =
    state.model ??
    asString(info?.model) ??
    asString(info?.model_name) ??
    asString(payload?.model) ??
    asString(record.model) ??
    LEGACY_FALLBACK_MODEL
  const modelProvider = rowModelProvider ?? state.modelProvider

  return {
    agent: 'codex',
    sourceFileKey: candidate.sourceFileKey,
    sourceRowKey: rowKey,
    sourceFileBasename: candidate.sourceFileBasename,
    sessionId: rowSessionId ?? state.sessionId,
    turnId: rowTurnId ?? state.turnId,
    project: rowProject ?? state.project,
    ts: parseTimestamp(record.timestamp ?? payload?.timestamp ?? info?.timestamp),
    model: normalizeCodexModel(rowModel),
    tokens,
    attributionMethod: 'unmatched',
    attributionConfidence: 0,
    meta: modelProvider
      ? { sourceKind: 'codex-token-count', modelProvider }
      : { sourceKind: 'codex-token-count' },
  }
}

function scanCandidate(
  candidate: UsageTranscriptCandidate,
  inheritedTotal: UsageTokenBreakdown | null,
): UsageScanResult {
  const initial = candidate.scanContext?.codex
  const records: UsageRecordFact[] = []
  const state: ScannerState = {
    model: initial?.model ?? null,
    modelProvider: initial?.modelProvider ?? null,
    sessionId: initial?.sessionId ?? null,
    turnId: initial?.turnId ?? null,
    project: initial?.project ?? null,
    previousTotal: initial?.previousTotal ?? null,
    inheritedTotal: initial?.inheritedTotal ?? inheritedTotal,
    remainingInheritedTotal: initial?.remainingInheritedTotal ?? inheritedTotal,
    seenRows: new Set(),
  }

  for (const { record, index } of lineRecords(
    candidate.content,
    lineMightContainCodexContext,
    candidate.rowIndexOffset ?? candidate.scanContext?.rowIndexOffset ?? 0,
  )) {
    const fact = scanRecord(candidate, record, index, state)
    if (fact) records.push(fact)
  }

  return {
    records,
    scanContext: {
      rowIndexOffset: candidate.rowIndexOffset ?? candidate.scanContext?.rowIndexOffset ?? 0,
      codex: scannerStateContext(state),
    },
  }
}

function scannerStateContext(state: ScannerState): UsageCodexScannerContext {
  return {
    model: state.model,
    modelProvider: state.modelProvider,
    sessionId: state.sessionId,
    turnId: state.turnId,
    project: state.project,
    previousTotal: state.previousTotal,
    inheritedTotal: state.inheritedTotal,
    remainingInheritedTotal: state.remainingInheritedTotal,
  }
}

export function scanCodexUsageTranscript(candidate: UsageTranscriptCandidate): UsageScanResult {
  return scanCandidate(candidate, null)
}

function inheritedTotals(
  parentSessionId: string,
  cutoffTimestamp: string | null,
  snapshotsBySessionId: Map<string, TokenSnapshot[]>,
): UsageTokenBreakdown | null {
  if (!cutoffTimestamp) return null
  const cutoffTs = parseTimestamp(cutoffTimestamp)
  let inherited: UsageTokenBreakdown | null = null
  for (const snapshot of snapshotsBySessionId.get(parentSessionId) ?? []) {
    const isAtOrBefore =
      snapshot.ts !== null && cutoffTs !== null
        ? snapshot.ts <= cutoffTs
        : snapshot.timestamp <= cutoffTimestamp
    if (isAtOrBefore) inherited = snapshot.totals
  }
  return inherited
}

export function scanCodexUsageTranscripts(candidates: UsageTranscriptCandidate[]): UsageScanResult {
  const ordered = [...candidates]
  const metadataByCandidate = new Map<UsageTranscriptCandidate, SessionMetadata>()
  const snapshotsBySessionId = new Map<string, TokenSnapshot[]>()

  for (const candidate of ordered) {
    const metadata = readSessionMetadata(candidate)
    const snapshots = tokenSnapshotRecords(candidate)
    const sessionId = metadata.sessionId ?? snapshots.sessionId
    metadataByCandidate.set(candidate, { ...metadata, sessionId })
    if (sessionId && !snapshotsBySessionId.has(sessionId)) {
      snapshotsBySessionId.set(sessionId, snapshots.snapshots)
    }
  }

  const records: UsageRecordFact[] = []
  const seenRows = new Set<string>()
  const seenSessionIds = new Set<string>()
  const seenPaths = new Set<string>()

  for (const candidate of ordered) {
    const pathKey = candidate.sourcePath ?? candidate.sourceFileKey
    if (seenPaths.has(pathKey)) continue
    seenPaths.add(pathKey)

    const metadata = metadataByCandidate.get(candidate) ?? {
      sessionId: null,
      forkedFromId: null,
      forkTimestamp: null,
    }
    if (metadata.sessionId && seenSessionIds.has(metadata.sessionId)) continue

    const inherited = metadata.forkedFromId
      ? inheritedTotals(metadata.forkedFromId, metadata.forkTimestamp, snapshotsBySessionId)
      : null
    for (const record of scanCandidate(candidate, inherited).records) {
      const key = `${record.sourceFileKey}:${record.sourceRowKey}`
      if (seenRows.has(key)) continue
      seenRows.add(key)
      records.push(record)
    }
    if (metadata.sessionId) seenSessionIds.add(metadata.sessionId)
  }

  return { records }
}
