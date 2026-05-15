import { createHash } from 'node:crypto'
import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import {
  buildUsageSummary,
  normalizeLiteLlmPricingPayload,
  pricingStatusFromCache,
  reconcileUsageWithHookEvents,
  SCHEMA_VERSION,
  sanitizeUsageMeta,
  scanClaudeUsageTranscripts,
  scanCodexUsageTranscripts,
  type UsageAgent,
  type UsagePricingEntry,
  type UsagePricingStatus,
  type UsageRecordFact,
  type UsageRefreshFrequency,
  type UsageScanState,
  type UsageSummary,
  type UsageSummaryArgs,
  type UsageTranscriptCandidate,
} from '@vibetime/core'
import type Database from 'better-sqlite3'
import { getDb, notifyRenderer } from './db.js'

const LITELLM_PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const DEFAULT_REFRESH_FREQUENCY: UsageRefreshFrequency = '30m'

type RefreshPricingStatus = UsagePricingStatus | 'unavailable'

export interface UsageRefreshOptions {
  refreshPricing?: boolean
  db?: Database.Database
  homeDir?: string
  env?: Partial<Pick<NodeJS.ProcessEnv, 'CODEX_HOME' | 'CLAUDE_CONFIG_DIR'>>
}

export interface DesktopUsageRefreshResult {
  frequency: UsageRefreshFrequency
  scannedAt: number
  recordsFound: number
  recordsInserted: number
  pricingStatus: RefreshPricingStatus
}

export interface DesktopUsageSummaryArgs extends Pick<UsageSummaryArgs, 'periodDays' | 'now'> {
  db?: Database.Database
  agent?: 'all' | UsageAgent
  project?: string | null
  model?: string | null
  includeSidechain?: boolean
}

type HookUsageEvent = {
  agent: UsageAgent
  event_type: 'turn_start' | 'turn_end'
  project: string
  session_id: string
  turn_id: string | null
  ts: number
  duration_sec: number | null
}

type SourceFile = {
  agent: UsageAgent
  path: string
  sourceFileKey: string
  sourceFileBasename: string
  mtimeMs: number
  sizeBytes: number
}

type ScannerDefinition = {
  agent: UsageAgent
  roots: (homeDir: string, env: UsageRefreshOptions['env']) => string[]
  scan: (candidates: UsageTranscriptCandidate[]) => { records: UsageRecordFact[] }
}

let activeUsageRefreshFrequency: UsageRefreshFrequency = DEFAULT_REFRESH_FREQUENCY
let backgroundRefreshTimer: ReturnType<typeof setInterval> | null = null
let backgroundImmediateRefreshTimer: ReturnType<typeof setTimeout> | null = null

type UsageRecordRow = {
  agent: UsageRecordFact['agent']
  source_file_key: string
  source_row_key: string
  source_file_basename: string
  session_id: string | null
  turn_id: string | null
  project: string | null
  ts: number | null
  model: string
  input_tokens: number
  cached_input_tokens: number
  cache_creation_input_tokens: number
  output_tokens: number
  reasoning_output_tokens: number
  total_tokens: number
  attribution_method: UsageRecordFact['attributionMethod']
  attribution_confidence: number
  meta: string | null
}

type UsagePricingRow = {
  model: string
  provider: string
  input_usd_per_million: number | null
  cached_input_usd_per_million: number | null
  cache_creation_input_usd_per_million: number | null
  output_usd_per_million: number | null
  reasoning_output_usd_per_million: number | null
  source: string
  fetched_at: string
  raw_version: string
}

type UsageScanStateRow = {
  agent: UsageAgent
  source_file_key: string
  source_file_basename: string
  mtime_ms: number
  size_bytes: number
  last_scanned_at: number
  last_row_key: string | null
}

const SCANNER_REGISTRY: ScannerDefinition[] = [
  {
    agent: 'claude-code',
    roots: (homeDir, env) => [
      ...(env?.CLAUDE_CONFIG_DIR ? [join(env.CLAUDE_CONFIG_DIR, 'projects')] : []),
      join(homeDir, '.config', 'claude', 'projects'),
      join(homeDir, '.claude', 'projects'),
    ],
    scan: scanClaudeUsageTranscripts,
  },
  {
    agent: 'codex',
    roots: (homeDir, env) => [
      ...(env?.CODEX_HOME
        ? [join(env.CODEX_HOME, 'sessions'), join(env.CODEX_HOME, 'archived_sessions')]
        : []),
      join(homeDir, '.codex', 'sessions'),
      join(homeDir, '.codex', 'archived_sessions'),
    ],
    scan: scanCodexUsageTranscripts,
  },
]

function nowSeconds(): number {
  return Date.now() / 1000
}

function encodeMeta(meta: UsageRecordFact['meta']): string | null {
  const sanitized = sanitizeUsageMeta(meta)
  return Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null
}

function decodeMeta(meta: string | null): UsageRecordFact['meta'] {
  if (!meta) return null
  try {
    return sanitizeUsageMeta(JSON.parse(meta))
  } catch {
    return null
  }
}

function recordParams(record: UsageRecordFact): Record<string, unknown> {
  const updatedAt = nowSeconds()
  return {
    schema_version: SCHEMA_VERSION,
    agent: record.agent,
    source_file_key: record.sourceFileKey,
    source_row_key: record.sourceRowKey,
    source_file_basename: record.sourceFileBasename,
    session_id: record.sessionId ?? null,
    turn_id: record.turnId ?? null,
    project: record.project ?? null,
    ts: record.ts ?? null,
    model: record.model,
    input_tokens: record.tokens.inputTokens,
    cached_input_tokens: record.tokens.cachedInputTokens,
    cache_creation_input_tokens: record.tokens.cacheCreationInputTokens,
    output_tokens: record.tokens.outputTokens,
    reasoning_output_tokens: record.tokens.reasoningOutputTokens,
    total_tokens: record.tokens.totalTokens,
    attribution_method: record.attributionMethod,
    attribution_confidence: record.attributionConfidence,
    meta: encodeMeta(record.meta),
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}

export function upsertUsageRecords(
  db: Database.Database,
  records: readonly UsageRecordFact[],
): number {
  if (records.length === 0) return 0

  const statement = db.prepare(`
    INSERT INTO usage_records (
      schema_version,
      agent,
      source_file_key,
      source_row_key,
      source_file_basename,
      session_id,
      turn_id,
      project,
      ts,
      model,
      input_tokens,
      cached_input_tokens,
      cache_creation_input_tokens,
      output_tokens,
      reasoning_output_tokens,
      total_tokens,
      attribution_method,
      attribution_confidence,
      meta,
      created_at,
      updated_at
    )
    VALUES (
      $schema_version,
      $agent,
      $source_file_key,
      $source_row_key,
      $source_file_basename,
      $session_id,
      $turn_id,
      $project,
      $ts,
      $model,
      $input_tokens,
      $cached_input_tokens,
      $cache_creation_input_tokens,
      $output_tokens,
      $reasoning_output_tokens,
      $total_tokens,
      $attribution_method,
      $attribution_confidence,
      $meta,
      $created_at,
      $updated_at
    )
    ON CONFLICT(agent, source_file_key, source_row_key) DO UPDATE SET
      source_file_basename = excluded.source_file_basename,
      session_id = excluded.session_id,
      turn_id = excluded.turn_id,
      project = excluded.project,
      ts = excluded.ts,
      model = excluded.model,
      input_tokens = excluded.input_tokens,
      cached_input_tokens = excluded.cached_input_tokens,
      cache_creation_input_tokens = excluded.cache_creation_input_tokens,
      output_tokens = excluded.output_tokens,
      reasoning_output_tokens = excluded.reasoning_output_tokens,
      total_tokens = excluded.total_tokens,
      attribution_method = excluded.attribution_method,
      attribution_confidence = excluded.attribution_confidence,
      meta = excluded.meta,
      updated_at = excluded.updated_at
  `)

  return db.transaction((items: readonly UsageRecordFact[]) => {
    let changed = 0
    for (const record of items) changed += statement.run(recordParams(record)).changes
    return changed
  })(records)
}

export function upsertUsageScanState(
  db: Database.Database,
  states: readonly UsageScanState[],
): number {
  if (states.length === 0) return 0

  const statement = db.prepare(`
    INSERT INTO usage_scan_state (
      agent,
      source_file_key,
      source_file_basename,
      mtime_ms,
      size_bytes,
      last_scanned_at,
      last_row_key
    )
    VALUES (
      $agent,
      $source_file_key,
      $source_file_basename,
      $mtime_ms,
      $size_bytes,
      $last_scanned_at,
      $last_row_key
    )
    ON CONFLICT(agent, source_file_key) DO UPDATE SET
      source_file_basename = excluded.source_file_basename,
      mtime_ms = excluded.mtime_ms,
      size_bytes = excluded.size_bytes,
      last_scanned_at = excluded.last_scanned_at,
      last_row_key = excluded.last_row_key
  `)

  return db.transaction((items: readonly UsageScanState[]) => {
    let changed = 0
    for (const state of items) {
      changed += statement.run({
        agent: state.agent,
        source_file_key: state.sourceFileKey,
        source_file_basename: state.sourceFileBasename,
        mtime_ms: state.mtimeMs,
        size_bytes: state.sizeBytes,
        last_scanned_at: state.lastScannedAt,
        last_row_key: state.lastRowKey ?? null,
      }).changes
    }
    return changed
  })(states)
}

export function upsertUsagePricingCache(
  db: Database.Database,
  entries: readonly UsagePricingEntry[],
): number {
  if (entries.length === 0) return 0

  const statement = db.prepare(`
    INSERT INTO usage_pricing_cache (
      model,
      provider,
      input_usd_per_million,
      cached_input_usd_per_million,
      cache_creation_input_usd_per_million,
      output_usd_per_million,
      reasoning_output_usd_per_million,
      source,
      fetched_at,
      raw_version
    )
    VALUES (
      $model,
      $provider,
      $input_usd_per_million,
      $cached_input_usd_per_million,
      $cache_creation_input_usd_per_million,
      $output_usd_per_million,
      $reasoning_output_usd_per_million,
      $source,
      $fetched_at,
      $raw_version
    )
    ON CONFLICT(model) DO UPDATE SET
      provider = excluded.provider,
      input_usd_per_million = excluded.input_usd_per_million,
      cached_input_usd_per_million = excluded.cached_input_usd_per_million,
      cache_creation_input_usd_per_million = excluded.cache_creation_input_usd_per_million,
      output_usd_per_million = excluded.output_usd_per_million,
      reasoning_output_usd_per_million = excluded.reasoning_output_usd_per_million,
      source = excluded.source,
      fetched_at = excluded.fetched_at,
      raw_version = excluded.raw_version
  `)

  return db.transaction((items: readonly UsagePricingEntry[]) => {
    let changed = 0
    for (const entry of items) {
      changed += statement.run({
        model: entry.model,
        provider: entry.provider,
        input_usd_per_million: entry.inputUsdPerMillion,
        cached_input_usd_per_million: entry.cachedInputUsdPerMillion,
        cache_creation_input_usd_per_million: entry.cacheCreationInputUsdPerMillion,
        output_usd_per_million: entry.outputUsdPerMillion,
        reasoning_output_usd_per_million: entry.reasoningOutputUsdPerMillion,
        source: entry.source,
        fetched_at: entry.fetchedAt,
        raw_version: entry.rawVersion,
      }).changes
    }
    return changed
  })(entries)
}

function pricingRowToEntry(row: UsagePricingRow): UsagePricingEntry {
  return {
    model: row.model,
    provider: row.provider,
    inputUsdPerMillion: row.input_usd_per_million,
    cachedInputUsdPerMillion: row.cached_input_usd_per_million,
    cacheCreationInputUsdPerMillion: row.cache_creation_input_usd_per_million,
    outputUsdPerMillion: row.output_usd_per_million,
    reasoningOutputUsdPerMillion: row.reasoning_output_usd_per_million,
    source: row.source,
    fetchedAt: row.fetched_at,
    rawVersion: row.raw_version,
  }
}

export function readUsagePricingCache(db: Database.Database): UsagePricingEntry[] {
  return (
    db
      .prepare(`
        SELECT
          model,
          provider,
          input_usd_per_million,
          cached_input_usd_per_million,
          cache_creation_input_usd_per_million,
          output_usd_per_million,
          reasoning_output_usd_per_million,
          source,
          fetched_at,
          raw_version
        FROM usage_pricing_cache
        ORDER BY model ASC
      `)
      .all() as UsagePricingRow[]
  ).map(pricingRowToEntry)
}

function readUsageScanStateMap(db: Database.Database): Map<string, UsageScanStateRow> {
  const rows = db.prepare('SELECT * FROM usage_scan_state').all() as UsageScanStateRow[]
  return new Map(rows.map((row) => [`${row.agent}:${row.source_file_key}`, row]))
}

function sourceFileKey(agent: UsageAgent, path: string): string {
  const hash = createHash('sha256').update(path).digest('hex').slice(0, 16)
  return `${agent}:${hash}:${basename(path)}`
}

function discoverJsonlFiles(root: string, agent: UsageAgent, seenPaths: Set<string>): SourceFile[] {
  if (!existsSync(root)) return []

  const results: SourceFile[] = []
  const visit = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl') || seenPaths.has(path)) continue
      try {
        const stat = statSync(path)
        seenPaths.add(path)
        results.push({
          agent,
          path,
          sourceFileKey: sourceFileKey(agent, path),
          sourceFileBasename: basename(path),
          mtimeMs: stat.mtimeMs,
          sizeBytes: stat.size,
        })
      } catch {
        // Files can be rotated while the background scan is running.
      }
    }
  }

  visit(root)
  return results
}

function discoverSourceFiles(homeDir: string, env: UsageRefreshOptions['env']): SourceFile[] {
  const seenPaths = new Set<string>()
  return SCANNER_REGISTRY.flatMap((scanner) =>
    scanner
      .roots(homeDir, env)
      .flatMap((root) => discoverJsonlFiles(root, scanner.agent, seenPaths)),
  )
}

function changedSourceFiles(db: Database.Database, files: SourceFile[]): SourceFile[] {
  const scanState = readUsageScanStateMap(db)
  return files.filter((file) => {
    const previous = scanState.get(`${file.agent}:${file.sourceFileKey}`)
    return !previous || previous.mtime_ms !== file.mtimeMs || previous.size_bytes !== file.sizeBytes
  })
}

function scanSourceFiles(files: readonly SourceFile[]): {
  records: UsageRecordFact[]
  states: UsageScanState[]
} {
  const scannedAt = nowSeconds()
  const byAgent = new Map<UsageAgent, UsageTranscriptCandidate[]>()
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file.path, 'utf8')
    } catch {
      continue
    }
    const candidates = byAgent.get(file.agent) ?? []
    candidates.push({
      sourceFileKey: file.sourceFileKey,
      sourceFileBasename: file.sourceFileBasename,
      content,
    })
    byAgent.set(file.agent, candidates)
  }

  const records: UsageRecordFact[] = []
  for (const scanner of SCANNER_REGISTRY) {
    const candidates = byAgent.get(scanner.agent) ?? []
    if (candidates.length === 0) continue
    records.push(...scanner.scan(candidates).records)
  }

  const lastRowByFile = new Map<string, string>()
  for (const record of records) lastRowByFile.set(record.sourceFileKey, record.sourceRowKey)

  return {
    records,
    states: files.map((file) => ({
      agent: file.agent,
      sourceFileKey: file.sourceFileKey,
      sourceFileBasename: file.sourceFileBasename,
      mtimeMs: file.mtimeMs,
      sizeBytes: file.sizeBytes,
      lastScannedAt: scannedAt,
      lastRowKey: lastRowByFile.get(file.sourceFileKey) ?? null,
    })),
  }
}

function readHookUsageEvents(db: Database.Database): HookUsageEvent[] {
  const completed = db
    .prepare(`
      SELECT agent, event_type, project, session_id, turn_id, ts, duration_sec
      FROM events
      WHERE agent IN ('claude-code', 'codex')
        AND event_type IN ('turn_start', 'turn_end')
      ORDER BY ts ASC
    `)
    .all() as HookUsageEvent[]
  const active = db
    .prepare(`
      SELECT
        agent,
        'turn_start' AS event_type,
        project,
        session_id,
        turn_id,
        started_at AS ts,
        NULL AS duration_sec
      FROM open_turns
      WHERE agent IN ('claude-code', 'codex')
      ORDER BY started_at ASC
    `)
    .all() as HookUsageEvent[]

  return [...completed, ...active]
}

async function refreshPricingCache(db: Database.Database): Promise<RefreshPricingStatus> {
  try {
    const pricingHttpResult = await fetch(LITELLM_PRICING_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VibeTime',
      },
    })
    if (!pricingHttpResult.ok) {
      throw new Error(`LiteLLM pricing refresh failed: ${pricingHttpResult.status}`)
    }

    const fetchedAt = new Date().toISOString()
    const entries = normalizeLiteLlmPricingPayload(await pricingHttpResult.json(), fetchedAt)
    if (entries.length === 0) throw new Error('LiteLLM pricing payload had no usable rows')
    upsertUsagePricingCache(db, entries)
    return 'fresh'
  } catch {
    return readUsagePricingCache(db).length > 0 ? 'cached' : 'unavailable'
  }
}

function frequencyToMs(frequency: UsageRefreshFrequency): number {
  switch (frequency) {
    case '15m':
      return 15 * 60 * 1000
    case '30m':
      return 30 * 60 * 1000
    case '1h':
      return 60 * 60 * 1000
    case '4h':
      return 4 * 60 * 60 * 1000
  }
}

function rowToRecord(row: UsageRecordRow): UsageRecordFact {
  return {
    agent: row.agent,
    sourceFileKey: row.source_file_key,
    sourceRowKey: row.source_row_key,
    sourceFileBasename: row.source_file_basename,
    sessionId: row.session_id,
    turnId: row.turn_id,
    project: row.project,
    ts: row.ts,
    model: row.model,
    tokens: {
      inputTokens: row.input_tokens,
      cachedInputTokens: row.cached_input_tokens,
      cacheCreationInputTokens: row.cache_creation_input_tokens,
      outputTokens: row.output_tokens,
      reasoningOutputTokens: row.reasoning_output_tokens,
      totalTokens: row.total_tokens,
    },
    attributionMethod: row.attribution_method,
    attributionConfidence: row.attribution_confidence,
    meta: decodeMeta(row.meta),
  }
}

export function readUsageRows(
  db: Database.Database,
  args: Pick<UsageSummaryArgs, 'periodDays' | 'now'>,
): UsageRecordFact[] {
  const now = args.now ?? new Date()
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() / 1000
  const rangeStart = rangeEnd - args.periodDays * 86400

  return (
    db
      .prepare(`
        SELECT
          agent,
          source_file_key,
          source_row_key,
          source_file_basename,
          session_id,
          turn_id,
          project,
          ts,
          model,
          input_tokens,
          cached_input_tokens,
          cache_creation_input_tokens,
          output_tokens,
          reasoning_output_tokens,
          total_tokens,
          attribution_method,
          attribution_confidence,
          meta
        FROM usage_records
        WHERE ts IS NOT NULL
          AND ts >= ?
          AND ts < ?
        ORDER BY ts ASC, id ASC
      `)
      .all(rangeStart, rangeEnd) as UsageRecordRow[]
  ).map(rowToRecord)
}

function filterUsageRows(
  records: readonly UsageRecordFact[],
  args: DesktopUsageSummaryArgs,
): UsageRecordFact[] {
  return records.filter((record) => {
    if (args.agent && args.agent !== 'all' && record.agent !== args.agent) return false
    if (args.project && record.project !== args.project) return false
    if (args.model && record.model !== args.model) return false
    if (args.includeSidechain === false && record.meta?.isSidechain === true) return false
    return true
  })
}

export function queryUsageSummary(args: DesktopUsageSummaryArgs): UsageSummary {
  const db = args.db ?? getDb()
  return db.transaction(() => {
    const prices = readUsagePricingCache(db)
    const records = filterUsageRows(readUsageRows(db, args), args)
    return buildUsageSummary(records, {
      periodDays: args.periodDays,
      now: args.now,
      agents: args.agent && args.agent !== 'all' ? [args.agent] : undefined,
      prices,
      pricingStatus: pricingStatusFromCache(prices, args.now ?? new Date()),
    })
  })()
}

export async function runUsageRefresh(
  options: UsageRefreshOptions = {},
): Promise<DesktopUsageRefreshResult> {
  const db = options.db ?? getDb()
  const homeDir = options.homeDir ?? homedir()
  const refreshPricing = options.refreshPricing ?? true
  const scannedAt = nowSeconds()
  const files = changedSourceFiles(db, discoverSourceFiles(homeDir, options.env ?? process.env))
  const { records, states } = scanSourceFiles(files)
  const hookEvents = readHookUsageEvents(db)
  const reconciled = reconcileUsageWithHookEvents(records, hookEvents)

  const recordsInserted = db.transaction(() => {
    const changedRows = upsertUsageRecords(db, reconciled)
    upsertUsageScanState(db, states)
    return changedRows
  })()

  const pricingStatus = refreshPricing
    ? await refreshPricingCache(db)
    : pricingStatusFromCache(readUsagePricingCache(db), new Date(scannedAt * 1000))

  if (recordsInserted > 0 || pricingStatus === 'fresh') notifyRenderer({ type: 'db-changed' })

  return {
    frequency: activeUsageRefreshFrequency,
    scannedAt,
    recordsFound: records.length,
    recordsInserted,
    pricingStatus,
  }
}

export function startUsageBackgroundRefresh(frequency: UsageRefreshFrequency): void {
  stopUsageBackgroundRefresh()
  activeUsageRefreshFrequency = frequency
  backgroundImmediateRefreshTimer = setTimeout(() => {
    backgroundImmediateRefreshTimer = null
    void runUsageRefresh({ refreshPricing: true })
  }, 0)
  backgroundRefreshTimer = setInterval(() => {
    void runUsageRefresh({ refreshPricing: true })
  }, frequencyToMs(frequency))
}

export function stopUsageBackgroundRefresh(): void {
  if (backgroundImmediateRefreshTimer) {
    clearTimeout(backgroundImmediateRefreshTimer)
    backgroundImmediateRefreshTimer = null
  }
  if (backgroundRefreshTimer) {
    clearInterval(backgroundRefreshTimer)
    backgroundRefreshTimer = null
  }
}
