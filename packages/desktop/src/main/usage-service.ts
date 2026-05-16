import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  type Dirent,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs'
import { opendir, open as openFile, stat as statFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize } from 'node:path'
import { Worker } from 'node:worker_threads'
import {
  buildUsagePeriodCompare,
  buildUsageSummary,
  normalizeLiteLlmPricingPayload,
  pricingStatusFromCache,
  reconcileUsageWithHookEvents,
  resolveProject,
  SCHEMA_VERSION,
  sanitizeUsageMeta,
  scanClaudeUsageTranscript,
  scanCodexUsageTranscript,
  scanCodexUsageTranscripts,
  type UsageAgent,
  type UsageEfficiencyBreakdownRow,
  type UsageEfficiencySummary,
  type UsageEfficiencyTotals,
  type UsagePricingEntry,
  type UsagePricingStatus,
  type UsageRecordFact,
  type UsageRefreshFrequency,
  type UsageScannerContext,
  type UsageScanState,
  type UsageSummary,
  type UsageSummaryArgs,
  type UsageTranscriptCandidate,
} from '@vibetime/core'
import type Database from 'better-sqlite3'
import SqliteDatabase from 'better-sqlite3'
import type { IpcPushEvent } from '../shared/ipc-types.js'
import { openDesktopDb } from './desktop-db.js'

const LITELLM_PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const DEFAULT_REFRESH_FREQUENCY: UsageRefreshFrequency = '15m'
const NO_USAGE_ROW_KEY = '__vibetime_no_usage__'
const CLAUDE_SCAN_STATE_PREFIX = 'claude-usage-v7:'
const CODEX_SCAN_STATE_PREFIX = 'codex-codexbar-v7:'
const BACKGROUND_INITIAL_REFRESH_DELAY_MS = 60_000
const CODEX_GLOBAL_CONTEXT_PREFIX_BYTES = 256 * 1024
const USAGE_SCAN_WORKER_TIMEOUT_MS = 10 * 60_000
const USAGE_PROJECT_RESOLVE_YIELD_INTERVAL = 250
const USAGE_DB_WRITE_CHUNK_SIZE = 250
const USAGE_REFRESH_FILE_BATCH_SIZE = 300
const USAGE_INITIAL_REFRESH_FILE_BATCH_SIZE = 600
const USAGE_SCAN_WORKER_FILE_YIELD_INTERVAL = 4
const USAGE_SCAN_WORKER_FILE_YIELD_MS = 1
const USAGE_PROGRESS_NOTIFY_INTERVAL_MS = 2_000
const USAGE_DISCOVERY_YIELD_INTERVAL = 128
const USAGE_HOOK_RECONCILE_PADDING_SEC = 86400

type RefreshPricingStatus = UsagePricingStatus | 'unavailable'
type RefreshPricingCacheResult = {
  status: RefreshPricingStatus
  changed: boolean
}

export interface UsageRefreshOptions {
  refreshPricing?: boolean
  db?: Database.Database
  homeDir?: string
  env?: Partial<Pick<NodeJS.ProcessEnv, 'CODEX_HOME' | 'CLAUDE_CONFIG_DIR'>>
  useDefaultAppRefreshPath?: boolean
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

export interface DesktopMenubarUsageSummary {
  today: DesktopMenubarUsagePeriodSummary
  last7Days: DesktopMenubarUsagePeriodSummary
  last30Days: DesktopMenubarUsagePeriodSummary
}

export interface DesktopMenubarUsagePeriodSummary {
  estimatedCostUsd: number | null
  totalTokens: number
  recordCount: number
  cacheHitRate: number
  costDeltaRatio: number | null
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

type SourceFileScanResult = {
  records: UsageRecordFact[]
  states: UsageScanState[]
  replaceStates: UsageScanState[]
}

type ScannerDefinition = {
  agent: UsageAgent
  roots: (homeDir: string, env: UsageRefreshOptions['env']) => string[]
}

function claudeProjectRoots(homeDir: string, env: UsageRefreshOptions['env']): string[] {
  const configuredRoots = env?.CLAUDE_CONFIG_DIR?.split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((path) => expandHomePath(path, homeDir))
    .map((path) => (basename(path) === 'projects' ? path : join(path, 'projects')))

  if (configuredRoots && configuredRoots.length > 0) return configuredRoots
  return [join(homeDir, '.config', 'claude', 'projects'), join(homeDir, '.claude', 'projects')]
}

function codexTranscriptRoots(homeDir: string, env: UsageRefreshOptions['env']): string[] {
  const configuredHome = env?.CODEX_HOME?.trim()
  const codexHome = configuredHome
    ? expandHomePath(configuredHome, homeDir)
    : join(homeDir, '.codex')
  return [join(codexHome, 'sessions'), join(codexHome, 'archived_sessions')]
}

let activeUsageRefreshFrequency: UsageRefreshFrequency = DEFAULT_REFRESH_FREQUENCY
let backgroundRefreshTimer: ReturnType<typeof setInterval> | null = null
let backgroundImmediateRefreshTimer: ReturnType<typeof setTimeout> | null = null
let defaultUsageRefreshInFlight: Promise<DesktopUsageRefreshResult> | null = null
let defaultUsageRefreshScheduled = false
let lastExistingUsageReconcileFingerprint: string | null = null
let lastDefaultUsageRefreshResult: ReturnType<typeof usageRefreshResultForPush> | null = null
let lastDefaultUsageRefreshError: string | null = null
let fallbackUsageDb: Database.Database | null = null
let usageRuntime: {
  getDb?: () => Database.Database
  notifyRenderer?: (event?: IpcPushEvent) => void
  runRefreshOutOfProcess?: (options: UsageRefreshOptions) => Promise<DesktopUsageRefreshResult>
} = {}

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
  parsed_bytes: number | null
  scan_context: string | null
}

const SCANNER_REGISTRY: ScannerDefinition[] = [
  {
    agent: 'claude-code',
    roots: claudeProjectRoots,
  },
  {
    agent: 'codex',
    roots: codexTranscriptRoots,
  },
]
const CODEX_GLOBAL_CONTEXT_MARKERS = [
  '"forked_from_id"',
  '"forkedFromId"',
  '"parent_session_id"',
  '"parentSessionId"',
]

export function configureUsageServiceRuntime(runtime: typeof usageRuntime): void {
  usageRuntime = runtime
}

function getUsageDb(db?: Database.Database): Database.Database {
  if (db) return db
  const runtimeDb = usageRuntime.getDb?.()
  if (runtimeDb) return runtimeDb
  fallbackUsageDb ??= openDesktopDb()
  return fallbackUsageDb
}

function notifyUsageRenderer(event: IpcPushEvent): void {
  usageRuntime.notifyRenderer?.(event)
}

function nowSeconds(): number {
  return Date.now() / 1000
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
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

function encodeScanContext(context: UsageScannerContext | null | undefined): string | null {
  if (!context) return null
  return JSON.stringify(context)
}

function decodeScanContext(context: string | null): UsageScannerContext | null {
  if (!context) return null
  try {
    const parsed = JSON.parse(context)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as UsageScannerContext)
      : null
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

async function upsertUsageRecordsChunked(
  db: Database.Database,
  records: readonly UsageRecordFact[],
): Promise<number> {
  let changed = 0
  for (let index = 0; index < records.length; index += USAGE_DB_WRITE_CHUNK_SIZE) {
    changed += upsertUsageRecords(db, records.slice(index, index + USAGE_DB_WRITE_CHUNK_SIZE))
    await yieldToEventLoop()
  }
  return changed
}

function deleteUsageRecordsForScannedFiles(
  db: Database.Database,
  states: readonly UsageScanState[],
): number {
  if (states.length === 0) return 0

  const statement = db.prepare(`
    DELETE FROM usage_records
    WHERE agent = ?
      AND source_file_key = ?
  `)

  let changed = 0
  for (const state of states) changed += statement.run(state.agent, state.sourceFileKey).changes
  return changed
}

async function deleteUsageRecordsForScannedFilesChunked(
  db: Database.Database,
  states: readonly UsageScanState[],
): Promise<number> {
  let changed = 0
  for (let index = 0; index < states.length; index += USAGE_DB_WRITE_CHUNK_SIZE) {
    changed += deleteUsageRecordsForScannedFiles(
      db,
      states.slice(index, index + USAGE_DB_WRITE_CHUNK_SIZE),
    )
    await yieldToEventLoop()
  }
  return changed
}

function deleteMissingSourceFileRecords(
  db: Database.Database,
  files: readonly SourceFile[],
): number {
  const currentKeysByAgent = new Map<UsageAgent, Set<string>>()
  for (const file of files) {
    const keys = currentKeysByAgent.get(file.agent) ?? new Set<string>()
    keys.add(file.sourceFileKey)
    currentKeysByAgent.set(file.agent, keys)
  }
  if (currentKeysByAgent.size === 0) return 0

  const rows = db
    .prepare(`
      SELECT agent, source_file_key
      FROM usage_scan_state
      WHERE agent IN (${Array.from(currentKeysByAgent.keys())
        .map(() => '?')
        .join(', ')})
      UNION
      SELECT agent, source_file_key
      FROM usage_records
      WHERE agent IN (${Array.from(currentKeysByAgent.keys())
        .map(() => '?')
        .join(', ')})
    `)
    .all(...currentKeysByAgent.keys(), ...currentKeysByAgent.keys()) as Array<{
    agent: UsageAgent
    source_file_key: string
  }>

  const deleteRecords = db.prepare(`
    DELETE FROM usage_records
    WHERE agent = ?
      AND source_file_key = ?
  `)
  const deleteState = db.prepare(`
    DELETE FROM usage_scan_state
    WHERE agent = ?
      AND source_file_key = ?
  `)

  let changed = 0
  for (const row of rows) {
    if (currentKeysByAgent.get(row.agent)?.has(row.source_file_key)) continue
    changed += deleteRecords.run(row.agent, row.source_file_key).changes
    deleteState.run(row.agent, row.source_file_key)
  }

  return changed
}

async function writeUsageRefreshBatchChanges(
  db: Database.Database,
  args: {
    states: readonly UsageScanState[]
    replaceStates: readonly UsageScanState[]
    records: readonly UsageRecordFact[]
  },
): Promise<number> {
  const deletedScannedRows = await deleteUsageRecordsForScannedFilesChunked(db, args.replaceStates)
  const changedRows = await upsertUsageRecordsChunked(db, args.records)
  await upsertUsageScanStateChunked(db, args.states)
  return deletedScannedRows + changedRows
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
      last_row_key,
      parsed_bytes,
      scan_context
    )
    VALUES (
      $agent,
      $source_file_key,
      $source_file_basename,
      $mtime_ms,
      $size_bytes,
      $last_scanned_at,
      $last_row_key,
      $parsed_bytes,
      $scan_context
    )
    ON CONFLICT(agent, source_file_key) DO UPDATE SET
      source_file_basename = excluded.source_file_basename,
      mtime_ms = excluded.mtime_ms,
      size_bytes = excluded.size_bytes,
      last_scanned_at = excluded.last_scanned_at,
      last_row_key = excluded.last_row_key,
      parsed_bytes = excluded.parsed_bytes,
      scan_context = excluded.scan_context
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
        parsed_bytes: state.parsedBytes ?? null,
        scan_context: encodeScanContext(state.scanContext),
      }).changes
    }
    return changed
  })(states)
}

async function upsertUsageScanStateChunked(
  db: Database.Database,
  states: readonly UsageScanState[],
): Promise<number> {
  let changed = 0
  for (let index = 0; index < states.length; index += USAGE_DB_WRITE_CHUNK_SIZE) {
    changed += upsertUsageScanState(db, states.slice(index, index + USAGE_DB_WRITE_CHUNK_SIZE))
    await yieldToEventLoop()
  }
  return changed
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

async function upsertUsagePricingCacheChunked(
  db: Database.Database,
  entries: readonly UsagePricingEntry[],
): Promise<number> {
  let changed = 0
  for (let index = 0; index < entries.length; index += USAGE_DB_WRITE_CHUNK_SIZE) {
    changed += upsertUsagePricingCache(db, entries.slice(index, index + USAGE_DB_WRITE_CHUNK_SIZE))
    await yieldToEventLoop()
  }
  return changed
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
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )
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

async function discoverJsonlFilesAsync(
  root: string,
  agent: UsageAgent,
  seenPaths: Set<string>,
): Promise<SourceFile[]> {
  try {
    const rootStat = await statFile(root)
    if (!rootStat.isDirectory()) return []
  } catch {
    return []
  }

  const results: SourceFile[] = []
  let visitedEntries = 0
  const visit = async (dir: string): Promise<void> => {
    let entries: Dirent[] = []
    try {
      const handle = await opendir(dir)
      for await (const entry of handle) entries.push(entry)
    } catch {
      return
    }
    entries = entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      visitedEntries += 1
      if (visitedEntries % USAGE_DISCOVERY_YIELD_INTERVAL === 0) await yieldToEventLoop()

      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl') || seenPaths.has(path)) continue
      try {
        const stat = await statFile(path)
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

  await visit(root)
  return results
}

async function discoverSourceFilesAsync(
  homeDir: string,
  env: UsageRefreshOptions['env'],
): Promise<SourceFile[]> {
  const seenPaths = new Set<string>()
  const files: SourceFile[] = []
  for (const scanner of SCANNER_REGISTRY) {
    for (const root of scanner.roots(homeDir, env)) {
      files.push(...(await discoverJsonlFilesAsync(root, scanner.agent, seenPaths)))
    }
  }
  return files
}

function changedSourceFiles(
  scanState: Map<string, UsageScanStateRow>,
  files: SourceFile[],
): SourceFile[] {
  return files.filter((file) => {
    const previous = scanState.get(`${file.agent}:${file.sourceFileKey}`)
    if (
      file.agent === 'claude-code' &&
      (previous?.last_row_key === null ||
        (previous?.last_row_key && !previous.last_row_key.startsWith(CLAUDE_SCAN_STATE_PREFIX)))
    ) {
      return true
    }
    if (
      file.agent === 'codex' &&
      (previous?.last_row_key === null ||
        (previous?.last_row_key && !previous.last_row_key.startsWith(CODEX_SCAN_STATE_PREFIX)))
    ) {
      return true
    }
    return !previous || previous.mtime_ms !== file.mtimeMs || previous.size_bytes !== file.sizeBytes
  })
}

function scanStateForFiles(
  scanState: Map<string, UsageScanStateRow>,
  files: readonly SourceFile[],
): Map<string, UsageScanStateRow> {
  if (scanState.size === 0 || files.length === 0) return scanState

  const batchState = new Map<string, UsageScanStateRow>()
  for (const file of files) {
    const key = usageScanStateKey(file.agent, file.sourceFileKey)
    const state = scanState.get(key)
    if (state) batchState.set(key, state)
  }
  return batchState
}

function scanScopeSourceFiles(
  files: readonly SourceFile[],
  changedFiles: readonly SourceFile[],
): SourceFile[] {
  if (changedFiles.length === 0) return []

  const changedKeys = new Set(changedFiles.map((file) => `${file.agent}:${file.sourceFileKey}`))
  const globalContextAgents = new Set(
    changedFiles.filter(fileNeedsGlobalScanContext).map((file) => file.agent),
  )

  return files.filter(
    (file) =>
      globalContextAgents.has(file.agent) || changedKeys.has(`${file.agent}:${file.sourceFileKey}`),
  )
}

async function scanScopeSourceFilesAsync(
  files: readonly SourceFile[],
  changedFiles: readonly SourceFile[],
): Promise<{ files: SourceFile[]; needsGlobalScanContext: boolean }> {
  if (changedFiles.length === 0) return { files: [], needsGlobalScanContext: false }

  const changedKeys = new Set(changedFiles.map((file) => `${file.agent}:${file.sourceFileKey}`))
  const globalContextAgents = new Set<UsageAgent>()
  let checkedCodexFiles = 0

  for (const file of changedFiles) {
    if (file.agent !== 'codex') continue
    checkedCodexFiles += 1
    if (await fileNeedsGlobalScanContextAsync(file)) globalContextAgents.add(file.agent)
    if (checkedCodexFiles % USAGE_SCAN_WORKER_FILE_YIELD_INTERVAL === 0) {
      await yieldToEventLoop()
    }
  }

  return {
    files: files.filter(
      (file) =>
        globalContextAgents.has(file.agent) ||
        changedKeys.has(`${file.agent}:${file.sourceFileKey}`),
    ),
    needsGlobalScanContext: globalContextAgents.size > 0,
  }
}

function fileNeedsGlobalScanContext(file: SourceFile): boolean {
  if (file.agent !== 'codex') return false

  const content = readFilePrefix(file.path, CODEX_GLOBAL_CONTEXT_PREFIX_BYTES)
  if (!content) return false
  return CODEX_GLOBAL_CONTEXT_MARKERS.some((marker) => content.includes(marker))
}

async function fileNeedsGlobalScanContextAsync(file: SourceFile): Promise<boolean> {
  if (file.agent !== 'codex') return false

  const content = await readFilePrefixAsync(file.path, CODEX_GLOBAL_CONTEXT_PREFIX_BYTES)
  if (!content) return false
  return CODEX_GLOBAL_CONTEXT_MARKERS.some((marker) => content.includes(marker))
}

function readFilePrefix(path: string, maxBytes: number): string | null {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buffer = Buffer.allocUnsafe(maxBytes)
    const bytesRead = readSync(fd, buffer, 0, maxBytes, 0)
    return bytesRead > 0 ? buffer.toString('utf8', 0, bytesRead) : ''
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // Best-effort close for files that may rotate while scanning.
      }
    }
  }
}

async function readFilePrefixAsync(path: string, maxBytes: number): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof openFile>> | null = null
  try {
    handle = await openFile(path, 'r')
    const buffer = Buffer.allocUnsafe(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    return bytesRead > 0 ? buffer.toString('utf8', 0, bytesRead) : ''
  } catch {
    return null
  } finally {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // Best-effort close for files that may rotate while scanning.
      }
    }
  }
}

function claudeCanonicalDedupeKey(record: UsageRecordFact): string | null {
  const parts = record.sourceRowKey.split(':')
  return record.agent === 'claude-code' &&
    record.sessionId &&
    parts.length === 3 &&
    parts[0] === record.sessionId
    ? record.sourceRowKey
    : null
}

function shouldReplaceClaudeCanonical(
  existing: UsageRecordFact,
  candidate: UsageRecordFact,
): boolean {
  const existingSidechain = existing.meta?.isSidechain === true
  const candidateSidechain = candidate.meta?.isSidechain === true
  if (existingSidechain !== candidateSidechain) return !candidateSidechain

  const existingRole = existing.meta?.claudePathRole
  const candidateRole = candidate.meta?.claudePathRole
  if (existingRole !== candidateRole) return candidateRole === 'parent'

  return candidate.sourceFileKey < existing.sourceFileKey
}

function dedupeClaudeRecords(records: readonly UsageRecordFact[]): UsageRecordFact[] {
  const output: UsageRecordFact[] = []
  const keyedRecords = new Map<string, UsageRecordFact>()

  for (const record of records) {
    const key = claudeCanonicalDedupeKey(record)
    if (!key) {
      output.push(record)
      continue
    }

    const existing = keyedRecords.get(key)
    if (!existing) {
      keyedRecords.set(key, record)
      output.push(record)
      continue
    }

    if (shouldReplaceClaudeCanonical(existing, record)) {
      keyedRecords.set(key, record)
      output[output.indexOf(existing)] = record
    }
  }

  return output
}

function usageScanStateKey(agent: UsageAgent, sourceFileKey: string): string {
  return `${agent}:${sourceFileKey}`
}

function countLineIndexDelta(content: string): number {
  if (content.length === 0) return 0
  let count = 0
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) count += 1
  }
  return count
}

function readFileUtf8FromOffset(path: string, offset: number): string {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const stat = statSync(path)
    const start = Math.max(0, Math.min(offset, stat.size))
    const size = stat.size - start
    if (size <= 0) return ''
    const buffer = Buffer.allocUnsafe(size)
    let total = 0
    while (total < size) {
      const bytes = readSync(fd, buffer, total, size - total, start + total)
      if (bytes <= 0) break
      total += bytes
    }
    return buffer.toString('utf8', 0, total)
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

function previousScanContext(row: UsageScanStateRow | undefined): UsageScannerContext | null {
  return row ? decodeScanContext(row.scan_context) : null
}

function shouldAppendScan(file: SourceFile, previous: UsageScanStateRow | undefined): boolean {
  if (!previous?.parsed_bytes || previous.parsed_bytes <= 0) return false
  if (previous.parsed_bytes > file.sizeBytes) return false
  if (
    file.agent === 'claude-code' &&
    !previous.last_row_key?.startsWith(CLAUDE_SCAN_STATE_PREFIX)
  ) {
    return false
  }
  if (file.agent === 'codex' && !previous.last_row_key?.startsWith(CODEX_SCAN_STATE_PREFIX)) {
    return false
  }
  if (file.agent === 'codex' && !previousScanContext(previous)?.codex) return false
  return true
}

function buildUsageScanStates(
  scannedAt: number,
  scannedFiles: ReadonlyArray<{
    file: SourceFile
    parsedBytes: number
    scanContext: UsageScannerContext | null
  }>,
  records: readonly UsageRecordFact[],
): UsageScanState[] {
  const lastRowByFile = new Map<string, string>()
  for (const record of records) lastRowByFile.set(record.sourceFileKey, record.sourceRowKey)

  return scannedFiles.map(({ file, parsedBytes, scanContext }) => ({
    agent: file.agent,
    sourceFileKey: file.sourceFileKey,
    sourceFileBasename: file.sourceFileBasename,
    mtimeMs: file.mtimeMs,
    sizeBytes: file.sizeBytes,
    lastScannedAt: scannedAt,
    lastRowKey:
      file.agent === 'codex'
        ? `${CODEX_SCAN_STATE_PREFIX}${lastRowByFile.get(file.sourceFileKey) ?? NO_USAGE_ROW_KEY}`
        : file.agent === 'claude-code'
          ? `${CLAUDE_SCAN_STATE_PREFIX}${lastRowByFile.get(file.sourceFileKey) ?? NO_USAGE_ROW_KEY}`
          : (lastRowByFile.get(file.sourceFileKey) ?? NO_USAGE_ROW_KEY),
    parsedBytes,
    scanContext,
  }))
}

function scanSourceFiles(
  files: readonly SourceFile[],
  previousStates = new Map<string, UsageScanStateRow>(),
): SourceFileScanResult {
  const scannedAt = nowSeconds()
  const scannedFiles: Array<{
    file: SourceFile
    parsedBytes: number
    scanContext: UsageScannerContext | null
  }> = []
  const replaceFiles = new Set<string>()
  const records: UsageRecordFact[] = []
  const codexNeedsGlobalContext = files.some(fileNeedsGlobalScanContext)
  const globalCodexCandidates: UsageTranscriptCandidate[] = []

  for (const file of files) {
    const previous = previousStates.get(usageScanStateKey(file.agent, file.sourceFileKey))
    const append = !codexNeedsGlobalContext && shouldAppendScan(file, previous)
    const offset = append ? (previous?.parsed_bytes ?? 0) : 0
    let content: string
    try {
      content = readFileUtf8FromOffset(file.path, offset)
    } catch {
      continue
    }
    const previousContext = append ? previousScanContext(previous) : null
    const rowIndexOffset = previousContext?.rowIndexOffset ?? 0
    const candidate = {
      sourceFileKey: file.sourceFileKey,
      sourceFileBasename: file.sourceFileBasename,
      sourcePath: file.path,
      content,
      rowIndexOffset,
      scanContext: previousContext,
    }
    let scanContext: UsageScannerContext | null = {
      rowIndexOffset: rowIndexOffset + countLineIndexDelta(content),
    }

    if (file.agent === 'claude-code') {
      records.push(...scanClaudeUsageTranscript(candidate).records)
    } else if (file.agent === 'codex' && codexNeedsGlobalContext) {
      globalCodexCandidates.push(candidate)
    } else if (file.agent === 'codex') {
      const result = scanCodexUsageTranscript(candidate)
      records.push(...result.records)
      scanContext = {
        ...(result.scanContext ?? {}),
        rowIndexOffset: rowIndexOffset + countLineIndexDelta(content),
      }
    }
    scannedFiles.push({ file, parsedBytes: file.sizeBytes, scanContext })
    if (!append) replaceFiles.add(usageScanStateKey(file.agent, file.sourceFileKey))
  }

  if (globalCodexCandidates.length > 0) {
    records.push(...scanCodexUsageTranscripts(globalCodexCandidates).records)
  }

  const dedupedRecords = dedupeClaudeRecords(records)
  const states = buildUsageScanStates(scannedAt, scannedFiles, dedupedRecords)
  return {
    records: dedupedRecords,
    states,
    replaceStates: states.filter((state) =>
      replaceFiles.has(usageScanStateKey(state.agent, state.sourceFileKey)),
    ),
  }
}

type UsageScanWorkerMessage =
  | { ok: true; result: SourceFileScanResult }
  | { ok: false; error: string }

const USAGE_SCAN_WORKER_SOURCE = `
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { parentPort, workerData } from 'node:worker_threads';

const NO_USAGE_ROW_KEY = ${JSON.stringify(NO_USAGE_ROW_KEY)};
const CLAUDE_SCAN_STATE_PREFIX = ${JSON.stringify(CLAUDE_SCAN_STATE_PREFIX)};
const CODEX_SCAN_STATE_PREFIX = ${JSON.stringify(CODEX_SCAN_STATE_PREFIX)};
const CODEX_GLOBAL_CONTEXT_PREFIX_BYTES = ${CODEX_GLOBAL_CONTEXT_PREFIX_BYTES};
const CODEX_GLOBAL_CONTEXT_MARKERS = ${JSON.stringify(CODEX_GLOBAL_CONTEXT_MARKERS)};
const FILE_YIELD_INTERVAL = ${USAGE_SCAN_WORKER_FILE_YIELD_INTERVAL};
const FILE_YIELD_MS = ${USAGE_SCAN_WORKER_FILE_YIELD_MS};
const CONTENT_SEGMENT_BYTES = 1024 * 1024;

function nowSeconds() {
  return Date.now() / 1000;
}

function yieldWorker() {
  return new Promise((resolve) => setTimeout(resolve, FILE_YIELD_MS));
}

function readFilePrefix(path, maxBytes) {
  let fd = null;
  try {
    fd = openSync(path, 'r');
    const buffer = Buffer.allocUnsafe(maxBytes);
    const bytesRead = readSync(fd, buffer, 0, maxBytes, 0);
    return bytesRead > 0 ? buffer.toString('utf8', 0, bytesRead) : '';
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
  }
}

function usageScanStateKey(agent, sourceFileKey) {
  return agent + ':' + sourceFileKey;
}

function decodeScanContext(context) {
  if (!context) return null;
  try {
    const parsed = JSON.parse(context);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function previousScanContext(row) {
  return row ? decodeScanContext(row.scan_context) : null;
}

function shouldAppendScan(file, previous) {
  if (!previous || !previous.parsed_bytes || previous.parsed_bytes <= 0) return false;
  if (previous.parsed_bytes > file.sizeBytes) return false;
  if (
    file.agent === 'claude-code' &&
    (!previous.last_row_key || !previous.last_row_key.startsWith(CLAUDE_SCAN_STATE_PREFIX))
  ) {
    return false;
  }
  if (
    file.agent === 'codex' &&
    (!previous.last_row_key || !previous.last_row_key.startsWith(CODEX_SCAN_STATE_PREFIX))
  ) {
    return false;
  }
  if (file.agent === 'codex' && !(previousScanContext(previous) || {}).codex) return false;
  return true;
}

function countLineIndexDelta(content) {
  if (content.length === 0) return 0;
  let count = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) count += 1;
  }
  return count;
}

function readFileUtf8FromOffset(path, offset) {
  let fd = null;
  try {
    fd = openSync(path, 'r');
    const stat = statSync(path);
    const start = Math.max(0, Math.min(offset, stat.size));
    const size = stat.size - start;
    if (size <= 0) return '';
    const buffer = Buffer.allocUnsafe(size);
    let total = 0;
    while (total < size) {
      const bytes = readSync(fd, buffer, total, size - total, start + total);
      if (bytes <= 0) break;
      total += bytes;
    }
    return buffer.toString('utf8', 0, total);
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
  }
}

function fileNeedsGlobalScanContext(file) {
  if (file.agent !== 'codex') return false;
  const content = readFilePrefix(file.path, CODEX_GLOBAL_CONTEXT_PREFIX_BYTES);
  if (!content) return false;
  return CODEX_GLOBAL_CONTEXT_MARKERS.some((marker) => content.includes(marker));
}

function claudeCanonicalDedupeKey(record) {
  const parts = record.sourceRowKey.split(':');
  return record.agent === 'claude-code' &&
    record.sessionId &&
    parts.length === 3 &&
    parts[0] === record.sessionId
    ? record.sourceRowKey
    : null;
}

function shouldReplaceClaudeCanonical(existing, candidate) {
  const existingSidechain = existing.meta && existing.meta.isSidechain === true;
  const candidateSidechain = candidate.meta && candidate.meta.isSidechain === true;
  if (existingSidechain !== candidateSidechain) return !candidateSidechain;

  const existingRole = existing.meta && existing.meta.claudePathRole;
  const candidateRole = candidate.meta && candidate.meta.claudePathRole;
  if (existingRole !== candidateRole) return candidateRole === 'parent';

  return candidate.sourceFileKey < existing.sourceFileKey;
}

function dedupeClaudeRecords(records) {
  const output = [];
  const keyedRecords = new Map();

  for (const record of records) {
    const key = claudeCanonicalDedupeKey(record);
    if (!key) {
      output.push(record);
      continue;
    }

    const existing = keyedRecords.get(key);
    if (!existing) {
      keyedRecords.set(key, record);
      output.push(record);
      continue;
    }

    if (shouldReplaceClaudeCanonical(existing, record)) {
      keyedRecords.set(key, record);
      output[output.indexOf(existing)] = record;
    }
  }

  return output;
}

function buildUsageScanStates(scannedAt, scannedFiles, records) {
  const lastRowByFile = new Map();
  for (const record of records) lastRowByFile.set(record.sourceFileKey, record.sourceRowKey);

  return scannedFiles.map(({ file, parsedBytes, scanContext }) => ({
    agent: file.agent,
    sourceFileKey: file.sourceFileKey,
    sourceFileBasename: file.sourceFileBasename,
    mtimeMs: file.mtimeMs,
    sizeBytes: file.sizeBytes,
    lastScannedAt: scannedAt,
    lastRowKey:
      file.agent === 'codex'
        ? CODEX_SCAN_STATE_PREFIX + (lastRowByFile.get(file.sourceFileKey) || NO_USAGE_ROW_KEY)
        : file.agent === 'claude-code'
          ? CLAUDE_SCAN_STATE_PREFIX + (lastRowByFile.get(file.sourceFileKey) || NO_USAGE_ROW_KEY)
          : (lastRowByFile.get(file.sourceFileKey) || NO_USAGE_ROW_KEY),
    parsedBytes,
    scanContext,
  }));
}

function scanSegment(file, segment, scanContext, rowIndexOffset, core) {
  const records = [];
  let nextContext = scanContext ? { ...scanContext } : { rowIndexOffset };
  if (segment.length === 0) return { records, scanContext: nextContext };

  const candidate = {
    sourceFileKey: file.sourceFileKey,
    sourceFileBasename: file.sourceFileBasename,
    sourcePath: file.path,
    content: segment,
    rowIndexOffset,
    scanContext: nextContext,
  };

  if (file.agent === 'claude-code') {
    records.push(...core.scanClaudeUsageTranscript(candidate).records);
    nextContext = { rowIndexOffset: rowIndexOffset + countLineIndexDelta(segment) };
  } else if (file.agent === 'codex') {
    const result = core.scanCodexUsageTranscript(candidate);
    records.push(...result.records);
    nextContext = {
      ...(result.scanContext || {}),
      rowIndexOffset: rowIndexOffset + countLineIndexDelta(segment),
    };
  }

  return { records, scanContext: nextContext };
}

async function scanRegularFileFromOffset(file, offset, initialContext, core) {
  const records = [];
  let scanContext = initialContext ? { ...initialContext } : { rowIndexOffset: 0 };
  let rowIndexOffset = scanContext.rowIndexOffset || 0;
  let fd = null;
  let segmentCount = 0;
  try {
    fd = openSync(file.path, 'r');
    const stat = statSync(file.path);
    let position = Math.max(0, Math.min(offset, stat.size));
    const decoder = new StringDecoder('utf8');
    let remainder = '';

    while (position < stat.size) {
      const readSize = Math.min(CONTENT_SEGMENT_BYTES, stat.size - position);
      const buffer = Buffer.allocUnsafe(readSize);
      const bytesRead = readSync(fd, buffer, 0, readSize, position);
      if (bytesRead <= 0) break;
      position += bytesRead;

      const decoded = decoder.write(buffer.subarray(0, bytesRead));
      let chunk = remainder + decoded;
      const isFinalRead = position >= stat.size;
      if (!isFinalRead) {
        const newlineIndex = chunk.lastIndexOf('\\n');
        if (newlineIndex === -1) {
          remainder = chunk;
          continue;
        }
        remainder = chunk.slice(newlineIndex + 1);
        chunk = chunk.slice(0, newlineIndex + 1);
      } else {
        chunk += decoder.end();
        remainder = '';
      }

      const result = scanSegment(file, chunk, scanContext, rowIndexOffset, core);
      records.push(...result.records);
      scanContext = result.scanContext;
      rowIndexOffset = scanContext.rowIndexOffset || rowIndexOffset;
      segmentCount += 1;
      if (segmentCount % FILE_YIELD_INTERVAL === 0) {
        await yieldWorker();
      }
    }

    if (remainder.length > 0) {
      const result = scanSegment(file, remainder, scanContext, rowIndexOffset, core);
      records.push(...result.records);
      scanContext = result.scanContext;
    }
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
  }

  return { records, scanContext };
}

async function scanSourceFiles(files, previousStates, core) {
  const scannedAt = nowSeconds();
  const scannedFiles = [];
  const replaceFiles = new Set();
  const records = [];
  const codexNeedsGlobalContext = files.some(fileNeedsGlobalScanContext);
  const globalCodexCandidates = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const previous = previousStates.get(usageScanStateKey(file.agent, file.sourceFileKey));
    const append = !codexNeedsGlobalContext && shouldAppendScan(file, previous);
    const offset = append ? previous.parsed_bytes || 0 : 0;
    let scanContext = append ? previousScanContext(previous) : null;

    if (file.agent === 'claude-code') {
      const result = await scanRegularFileFromOffset(file, offset, scanContext, core);
      records.push(...result.records);
      scanContext = result.scanContext;
    } else if (file.agent === 'codex' && codexNeedsGlobalContext) {
      let content;
      try {
        content = readFileUtf8FromOffset(file.path, offset);
      } catch {
        continue;
      }
      const candidate = {
        sourceFileKey: file.sourceFileKey,
        sourceFileBasename: file.sourceFileBasename,
        sourcePath: file.path,
        content,
        rowIndexOffset: (scanContext && scanContext.rowIndexOffset) || 0,
        scanContext,
      };
      globalCodexCandidates.push(candidate);
    } else if (file.agent === 'codex') {
      const result = await scanRegularFileFromOffset(file, offset, scanContext, core);
      records.push(...result.records);
      scanContext = result.scanContext;
    }

    scannedFiles.push({ file, parsedBytes: file.sizeBytes, scanContext });
    if (!append) replaceFiles.add(usageScanStateKey(file.agent, file.sourceFileKey));

    if ((index + 1) % FILE_YIELD_INTERVAL === 0) {
      await yieldWorker();
    }
  }

  if (globalCodexCandidates.length > 0) {
    records.push(...core.scanCodexUsageTranscripts(globalCodexCandidates).records);
  }

  const dedupedRecords = dedupeClaudeRecords(records);
  const states = buildUsageScanStates(scannedAt, scannedFiles, dedupedRecords);
  return {
    records: dedupedRecords,
    states,
    replaceStates: states.filter((state) =>
      replaceFiles.has(usageScanStateKey(state.agent, state.sourceFileKey)),
    ),
  };
}

(async () => {
  const core = await import(workerData.coreModuleUrl);
  const previousStates = new Map(workerData.previousStates || []);
  const result = await scanSourceFiles(workerData.files || [], previousStates, core);
  parentPort.postMessage({ ok: true, result });
})().catch((error) => {
  parentPort.postMessage({
    ok: false,
    error: error && error.stack ? error.stack : String(error),
  });
});
`

async function scanSourceFilesOffMainThread(
  files: readonly SourceFile[],
  previousStates = new Map<string, UsageScanStateRow>(),
): Promise<SourceFileScanResult> {
  if (files.length === 0) return scanSourceFiles(files, previousStates)

  let coreModuleUrl: string
  try {
    coreModuleUrl = import.meta.resolve('@vibetime/core')
  } catch {
    return scanSourceFiles(files, previousStates)
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const worker = new Worker(USAGE_SCAN_WORKER_SOURCE, {
      eval: true,
      type: 'module',
      workerData: { coreModuleUrl, files, previousStates: Array.from(previousStates.entries()) },
    })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void worker.terminate()
      reject(new Error('Usage scan timed out'))
    }, USAGE_SCAN_WORKER_TIMEOUT_MS)

    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }

    worker.once('message', (message: UsageScanWorkerMessage) => {
      settle(() => {
        if (message.ok) {
          resolve(message.result)
        } else {
          reject(new Error(message.error))
        }
      })
    })

    worker.once('error', (error) => {
      settle(() => reject(error))
    })

    worker.once('exit', (code) => {
      if (code === 0) return
      settle(() => reject(new Error(`Usage scan worker exited with code ${code}`)))
    })
  })
}

function codexPriorityDatabasePath(homeDir: string, env: UsageRefreshOptions['env']): string {
  const codexHome = env?.CODEX_HOME
    ? expandHomePath(env.CODEX_HOME, homeDir)
    : join(homeDir, '.codex')
  return join(codexHome, 'logs_2.sqlite')
}

function valueAfterName(text: string, name: string): string | null {
  const marker = `${name}=`
  const start = text.indexOf(marker)
  if (start < 0) return null
  const tail = text.slice(start + marker.length)
  const value = tail.match(/^[^\s,\])]+/)?.[0]
  return value && value.length > 0 ? value : null
}

function parseCodexPriorityTurnId(body: string): string | null {
  const marker = 'websocket request:'
  const markerIndex = body.indexOf(marker)
  if (markerIndex < 0) return null

  const prefix = body.slice(0, markerIndex)
  const jsonText = body.slice(markerIndex + marker.length).trim()
  let request: unknown
  try {
    request = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) return null
  const payload = request as Record<string, unknown>
  if (payload.type !== 'response.create' || payload.service_tier !== 'priority') return null

  const turnId =
    valueAfterName(prefix, 'turn.id') ??
    valueAfterName(prefix, 'turn_id') ??
    (typeof payload.turn_id === 'string' ? payload.turn_id : null)
  return turnId && turnId.length > 0 ? turnId : null
}

function codexPriorityQueryWindow(records: readonly UsageRecordFact[]): {
  startTs: number
  endTs: number
} | null {
  const timestamps = records
    .filter((record) => record.agent === 'codex' && record.turnId && typeof record.ts === 'number')
    .map((record) => record.ts as number)
  if (timestamps.length === 0) return null

  const minTs = Math.min(...timestamps)
  const maxTs = Math.max(...timestamps)
  return {
    startTs: Math.max(0, Math.floor(minTs - 86400)),
    endTs: Math.ceil(maxTs + 86400),
  }
}

function readCodexPriorityTurnIds(
  databasePath: string,
  window: { startTs: number; endTs: number },
): Set<string> {
  if (!existsSync(databasePath)) return new Set()

  let db: Database.Database
  try {
    db = new SqliteDatabase(databasePath, { readonly: true, fileMustExist: true })
  } catch {
    return new Set()
  }

  try {
    db.pragma('busy_timeout = 250')
    const rows = db
      .prepare(`
        SELECT feedback_log_body
        FROM logs
        WHERE ts >= ?
          AND ts < ?
          AND feedback_log_body LIKE '%websocket request:%'
      `)
      .all(window.startTs, window.endTs) as Array<{ feedback_log_body: string | null }>

    const turnIds = new Set<string>()
    for (const row of rows) {
      if (!row.feedback_log_body) continue
      const turnId = parseCodexPriorityTurnId(row.feedback_log_body)
      if (turnId) turnIds.add(turnId)
    }
    return turnIds
  } catch {
    return new Set()
  } finally {
    db.close()
  }
}

function annotateCodexPriorityRecords(
  records: readonly UsageRecordFact[],
  homeDir: string,
  env: UsageRefreshOptions['env'],
): UsageRecordFact[] {
  if (!records.some((record) => record.agent === 'codex' && record.turnId)) return [...records]

  const queryWindow = codexPriorityQueryWindow(records)
  if (!queryWindow) return [...records]

  const priorityTurnIds = readCodexPriorityTurnIds(
    codexPriorityDatabasePath(homeDir, env),
    queryWindow,
  )
  if (priorityTurnIds.size === 0) return [...records]

  return records.map((record) => {
    if (record.agent !== 'codex' || !record.turnId || !priorityTurnIds.has(record.turnId)) {
      return record
    }
    return {
      ...record,
      meta: {
        ...(record.meta ?? {}),
        codexServiceTier: 'priority',
      },
    }
  })
}

function readProjectGitRemoteUrl(cwd: string): string | null {
  if (!isAbsolute(cwd) || !existsSync(cwd)) return null

  try {
    const originRemoteUrl = execFileSync(
      'git',
      ['-C', cwd, 'config', '--get', 'remote.origin.url'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1000,
      },
    ).trim()
    if (originRemoteUrl.length > 0) return originRemoteUrl
  } catch {
    // Some imported repositories use a remote name other than "origin".
  }

  try {
    const firstRemote = execFileSync('git', ['-C', cwd, 'remote'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })
      .split('\n')
      .map((remote) => remote.trim())
      .find((remote) => remote.length > 0)
    if (!firstRemote) return null

    const remoteUrl = execFileSync('git', ['-C', cwd, 'remote', 'get-url', firstRemote], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim()
    return remoteUrl.length > 0 ? remoteUrl : null
  } catch {
    return null
  }
}

function readGitTopLevel(cwd: string): string | null {
  if (!isAbsolute(cwd) || !existsSync(cwd)) return null

  try {
    const topLevel = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim()
    return topLevel.length > 0 ? topLevel : null
  } catch {
    return null
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    return parseJsonObject(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function firstJsonlObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    const firstLine = readFileSync(path, 'utf8')
      .split('\n')
      .find((line) => line.trim().length > 0)
    return firstLine ? parseJsonObject(firstLine) : null
  } catch {
    return null
  }
}

function expandHomePath(path: string, homeDir: string): string {
  if (path === '~') return homeDir
  return path.startsWith('~/') || path.startsWith('~\\') ? join(homeDir, path.slice(2)) : path
}

function toSlashPath(path: string): string {
  return normalize(path).replace(/\\/g, '/')
}

function isAbsolutePathLike(path: string): boolean {
  return (
    isAbsolute(path) ||
    path.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.startsWith('\\\\') ||
    path.startsWith('//')
  )
}

function isHomeRelativePath(path: string): boolean {
  return path === '~' || path.startsWith('~/') || path.startsWith('~\\')
}

function normalizeUsageProjectCwd(cwd: string): string {
  const claudeWorktreeMarker = '/.claude/worktrees/'
  const normalized = toSlashPath(cwd)
  const markerIndex = normalized.indexOf(claudeWorktreeMarker)
  if (markerIndex >= 0) return normalized.slice(0, markerIndex)
  return normalized
}

function pathLineage(cwd: string): string[] {
  const normalized = normalize(cwd)
  const lineage: string[] = []
  let current = normalized
  while (current && current !== dirname(current)) {
    lineage.push(current)
    current = dirname(current)
  }
  if (current) lineage.push(current)
  return lineage
}

function nearestExistingPath(cwd: string): string | null {
  for (const candidate of pathLineage(cwd)) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function readNearestProjectGitRemoteUrl(cwd: string): { cwd: string; remoteUrl: string } | null {
  const existing = nearestExistingPath(cwd)
  if (!existing) return null
  const gitRoot = readGitTopLevel(existing)
  if (!gitRoot) return null
  const remoteUrl = readProjectGitRemoteUrl(gitRoot)
  return remoteUrl ? { cwd: gitRoot, remoteUrl } : null
}

function isGeneratedWorkspaceLeaf(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
    /^temp-[a-z0-9-]+$/i.test(value) ||
    /^agent-[a-z0-9]+$/i.test(value) ||
    /^\d{6}-[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(value)
  )
}

function generatedWorkspaceParent(cwd: string): string | null {
  const normalized = toSlashPath(cwd)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length < 3) return null

  const leaf = parts[parts.length - 1]
  const marker = parts[parts.length - 2]
  if (!leaf || !marker || !isGeneratedWorkspaceLeaf(leaf)) return null
  if (!['workspace', 'workspaces', 'project', 'projects', 'session', 'sessions'].includes(marker)) {
    return null
  }

  const parentParts = parts.slice(0, -2)
  if (parentParts.length === 0) return null

  const joined = parentParts.join('/')
  if (/^[A-Za-z]:$/.test(parentParts[0] ?? '')) return joined
  if (normalized.startsWith('//')) return `//${joined}`
  return normalized.startsWith('/') ? `/${joined}` : joined
}

type CraftSessionContext = {
  project: string
  meta: NonNullable<UsageRecordFact['meta']>
}

function craftSessionContext(
  cwd: string,
  record: UsageRecordFact,
  homeDir: string,
): CraftSessionContext | null {
  const normalized = toSlashPath(cwd)
  const marker = '/.craft-agent/workspaces/'
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex < 0) return null

  const tail = normalized.slice(markerIndex + marker.length)
  const [workspaceSlug, sessionsMarker, sessionId] = tail.split('/')
  if (!workspaceSlug || sessionsMarker !== 'sessions' || !sessionId) return null

  const workspaceDir = join(homeDir, '.craft-agent', 'workspaces', workspaceSlug)
  const workspaceConfig = readJsonFile(join(workspaceDir, 'config.json'))
  const sessionMeta = firstJsonlObject(join(workspaceDir, 'sessions', sessionId, 'session.jsonl'))
  const workspaceName =
    typeof workspaceConfig?.name === 'string' && workspaceConfig.name.length > 0
      ? workspaceConfig.name
      : workspaceSlug
  const workspaceId =
    typeof workspaceConfig?.id === 'string' && workspaceConfig.id.length > 0
      ? workspaceConfig.id
      : undefined
  const sdkSessionId =
    typeof sessionMeta?.sdkSessionId === 'string' && sessionMeta.sdkSessionId.length > 0
      ? sessionMeta.sdkSessionId
      : undefined
  const sessionName =
    typeof sessionMeta?.name === 'string' && sessionMeta.name.length > 0
      ? sessionMeta.name
      : undefined

  return {
    project: `Craft Agent / ${workspaceName}`,
    meta: {
      projectResolutionKind: 'wrapper_workspace',
      projectResolutionSource: 'craft-agent-session',
      wrapperName: 'Craft Agent',
      ...(workspaceId ? { wrapperWorkspaceId: workspaceId } : {}),
      wrapperWorkspaceName: workspaceName,
      wrapperWorkspaceSlug: workspaceSlug,
      wrapperSessionId: sessionId,
      ...(sessionName ? { wrapperSessionName: sessionName } : {}),
      wrapperSessionMatch:
        sdkSessionId && sdkSessionId === record.sessionId ? 'sdk_session_id' : 'cwd',
    },
  }
}

type ResolvedUsageProject = {
  project: string | null
  meta?: NonNullable<UsageRecordFact['meta']>
}

function resolveUsageProject(
  rawProject: string,
  record: UsageRecordFact,
  homeDir: string,
): ResolvedUsageProject {
  const expanded = normalizeUsageProjectCwd(expandHomePath(rawProject, homeDir))
  const craftContext = craftSessionContext(expanded, record, homeDir)
  if (craftContext) return craftContext

  const generatedParent = generatedWorkspaceParent(expanded)
  if (generatedParent) {
    const nearestParentGit = readNearestProjectGitRemoteUrl(generatedParent)
    if (nearestParentGit) {
      const resolved = resolveProject({
        cwd: nearestParentGit.cwd,
        gitRemoteUrl: nearestParentGit.remoteUrl,
      })
      return {
        project: resolved === '_unknown' ? null : resolved,
        meta: {
          projectResolutionKind: 'git',
          projectResolutionSource: 'generated-workspace-parent-git',
        },
      }
    }

    const resolved = resolveProject({ cwd: generatedParent, gitRemoteUrl: null })
    return {
      project: resolved === '_unknown' ? null : resolved,
      meta: {
        projectResolutionKind: 'generated_parent',
        projectResolutionSource: 'generated-workspace-parent',
      },
    }
  }

  const nearestGit = readNearestProjectGitRemoteUrl(expanded)
  if (nearestGit) {
    const resolved = resolveProject({ cwd: nearestGit.cwd, gitRemoteUrl: nearestGit.remoteUrl })
    return {
      project: resolved === '_unknown' ? null : resolved,
      meta: { projectResolutionKind: 'git', projectResolutionSource: 'nearest-git-remote' },
    }
  }

  const resolved = resolveProject({ cwd: expanded, gitRemoteUrl: null })
  return {
    project: resolved === '_unknown' ? null : resolved,
    meta: { projectResolutionKind: 'local', projectResolutionSource: 'cwd-basename' },
  }
}

function usageProjectCacheKey(rawProject: string, homeDir: string): string {
  const expanded = normalizeUsageProjectCwd(expandHomePath(rawProject, homeDir))
  const normalized = toSlashPath(expanded)
  if (normalized.includes('/.craft-agent/workspaces/')) return `craft:${normalized}`

  const generatedParent = generatedWorkspaceParent(expanded)
  if (generatedParent) return `generated-parent:${toSlashPath(generatedParent)}`

  return `cwd:${normalized}`
}

async function resolveUsageRecordProjectsChunked(
  records: readonly UsageRecordFact[],
  homeDir: string,
  cache = new Map<string, string | null>(),
  metaCache = new Map<string, NonNullable<UsageRecordFact['meta']> | undefined>(),
): Promise<UsageRecordFact[]> {
  const resolved: UsageRecordFact[] = []

  for (const record of records) {
    resolved.push(resolveUsageRecordProjectWithCache(record, homeDir, cache, metaCache))
    if (resolved.length % USAGE_PROJECT_RESOLVE_YIELD_INTERVAL === 0) {
      await yieldToEventLoop()
    }
  }

  return resolved
}

function resolveUsageRecordProjectWithCache(
  record: UsageRecordFact,
  homeDir: string,
  cache: Map<string, string | null>,
  metaCache: Map<string, NonNullable<UsageRecordFact['meta']> | undefined>,
): UsageRecordFact {
  const rawProject = record.project
  if (!rawProject || (!isAbsolutePathLike(rawProject) && !isHomeRelativePath(rawProject))) {
    return record
  }

  const cacheKey = usageProjectCacheKey(rawProject, homeDir)
  let project = cache.get(cacheKey)
  if (!cache.has(cacheKey)) {
    const resolved = resolveUsageProject(rawProject, record, homeDir)
    project = resolved.project
    cache.set(cacheKey, project)
    metaCache.set(cacheKey, resolved.meta)
  }
  const resolutionMeta = metaCache.get(cacheKey)
  const meta = resolutionMeta ? { ...(record.meta ?? {}), ...resolutionMeta } : record.meta

  return project === rawProject && meta === record.meta ? record : { ...record, project, meta }
}

function readHookUsageEvents(
  db: Database.Database,
  range?: { startTs: number; endTs: number },
): HookUsageEvent[] {
  const completedFilters = [
    "agent IN ('claude-code', 'codex')",
    "event_type IN ('turn_start', 'turn_end')",
  ]
  const completedParams: number[] = []
  const activeFilters = ["agent IN ('claude-code', 'codex')"]
  const activeParams: number[] = []

  if (range) {
    completedFilters.push('ts >= ?', 'ts < ?')
    completedParams.push(range.startTs, range.endTs)
    activeFilters.push('started_at >= ?', 'started_at < ?')
    activeParams.push(range.startTs, range.endTs)
  }

  const completed = db
    .prepare(`
      SELECT agent, event_type, project, session_id, turn_id, ts, duration_sec
      FROM events
      WHERE ${completedFilters.join('\n        AND ')}
      ORDER BY ts ASC
    `)
    .all(...completedParams) as HookUsageEvent[]
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
      WHERE ${activeFilters.join('\n        AND ')}
      ORDER BY started_at ASC
    `)
    .all(...activeParams) as HookUsageEvent[]

  return [...completed, ...active]
}

function readHookUsageFingerprint(db: Database.Database): string {
  const completed = db
    .prepare(`
      SELECT COUNT(*) AS count, COALESCE(MAX(ts), 0) AS latest_ts
      FROM events
      WHERE agent IN ('claude-code', 'codex')
        AND event_type IN ('turn_start', 'turn_end')
    `)
    .get() as { count: number; latest_ts: number }
  const active = db
    .prepare(`
      SELECT COUNT(*) AS count, COALESCE(MAX(started_at), 0) AS latest_ts
      FROM open_turns
      WHERE agent IN ('claude-code', 'codex')
    `)
    .get() as { count: number; latest_ts: number }

  return `${completed.count + active.count}:${Math.max(completed.latest_ts, active.latest_ts)}`
}

function hookRangeForUsageRecords(
  records: readonly UsageRecordFact[],
): { startTs: number; endTs: number } | null {
  const timestamps = records
    .map((record) => record.ts)
    .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts))
  if (timestamps.length === 0) return null

  return {
    startTs: Math.max(0, Math.min(...timestamps) - USAGE_HOOK_RECONCILE_PADDING_SEC),
    endTs: Math.max(...timestamps) + USAGE_HOOK_RECONCILE_PADDING_SEC,
  }
}

function readHookUsageEventsForRecords(
  db: Database.Database,
  records: readonly UsageRecordFact[],
): HookUsageEvent[] {
  if (records.length === 0) return []
  const range = hookRangeForUsageRecords(records)
  return range ? readHookUsageEvents(db, range) : readHookUsageEvents(db)
}

function pricingEntrySignature(entry: UsagePricingEntry): string {
  return JSON.stringify({
    model: entry.model,
    provider: entry.provider,
    inputUsdPerMillion: entry.inputUsdPerMillion,
    cachedInputUsdPerMillion: entry.cachedInputUsdPerMillion,
    cacheCreationInputUsdPerMillion: entry.cacheCreationInputUsdPerMillion,
    outputUsdPerMillion: entry.outputUsdPerMillion,
    reasoningOutputUsdPerMillion: entry.reasoningOutputUsdPerMillion,
    source: entry.source,
    rawVersion: entry.rawVersion,
  })
}

function pricingEntriesChanged(
  previousEntries: readonly UsagePricingEntry[],
  nextEntries: readonly UsagePricingEntry[],
): boolean {
  const previous = new Map(
    previousEntries.map((entry) => [entry.model, pricingEntrySignature(entry)]),
  )
  if (previous.size !== nextEntries.length) return true
  return nextEntries.some((entry) => previous.get(entry.model) !== pricingEntrySignature(entry))
}

async function refreshPricingCache(db: Database.Database): Promise<RefreshPricingCacheResult> {
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
    const changed = pricingEntriesChanged(readUsagePricingCache(db), entries)
    await upsertUsagePricingCacheChunked(db, entries)
    return { status: 'fresh', changed }
  } catch {
    return {
      status: readUsagePricingCache(db).length > 0 ? 'cached' : 'unavailable',
      changed: false,
    }
  }
}

function frequencyToMs(frequency: UsageRefreshFrequency): number | null {
  switch (frequency) {
    case 'manual':
      return null
    case '1m':
      return 60 * 1000
    case '2m':
      return 2 * 60 * 1000
    case '5m':
      return 5 * 60 * 1000
    case '15m':
      return 15 * 60 * 1000
    case '30m':
      return 30 * 60 * 1000
  }
}

function usageDateRange(args: Pick<UsageSummaryArgs, 'periodDays' | 'now'>): {
  rangeStart: number
  rangeEnd: number
} {
  const now = args.now ?? new Date()
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() / 1000
  return {
    rangeStart: rangeEnd - args.periodDays * 86400,
    rangeEnd,
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
  args: Pick<UsageSummaryArgs, 'periodDays' | 'now'> &
    Pick<DesktopUsageSummaryArgs, 'agent' | 'project' | 'model'>,
): UsageRecordFact[] {
  const { rangeStart, rangeEnd } = usageDateRange(args)
  const filters = ['ts IS NOT NULL', 'ts >= ?', 'ts < ?']
  const params: Array<number | string> = [rangeStart, rangeEnd]

  if (args.agent && args.agent !== 'all') {
    filters.push('agent = ?')
    params.push(args.agent)
  }
  if (args.project) {
    filters.push('project = ?')
    params.push(args.project)
  }
  if (args.model) {
    filters.push('model = ?')
    params.push(args.model)
  }

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
        WHERE ${filters.join('\n          AND ')}
        ORDER BY ts ASC, id ASC
      `)
      .all(...params) as UsageRecordRow[]
  ).map(rowToRecord)
}

function readUnattributedUsageRows(db: Database.Database): UsageRecordFact[] {
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
        WHERE attribution_method = 'unmatched'
           OR project IS NULL
        ORDER BY ts ASC, id ASC
      `)
      .all() as UsageRecordRow[]
  ).map(rowToRecord)
}

function attributionChanged(before: UsageRecordFact, after: UsageRecordFact): boolean {
  return (
    before.project !== after.project ||
    before.turnId !== after.turnId ||
    before.sessionId !== after.sessionId ||
    before.attributionMethod !== after.attributionMethod ||
    before.attributionConfidence !== after.attributionConfidence
  )
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

type EfficiencyAccumulator = {
  durationSec: number
  turnKeys: Set<string>
}

function createEfficiencyAccumulator(): EfficiencyAccumulator {
  return { durationSec: 0, turnKeys: new Set() }
}

function startOfLocalDay(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

function toUsageDateKey(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-CA')
}

function denseUsageDateKeys(days: number, now: Date): string[] {
  const endDay = startOfLocalDay(now)
  const firstDay = endDay - (days - 1) * 86400
  return Array.from({ length: days }, (_, index) => toUsageDateKey(firstDay + index * 86400))
}

function costPerHour(estimatedCostUsd: number | null, durationSec: number): number | null {
  if (estimatedCostUsd === null || durationSec <= 0) return null
  return estimatedCostUsd / (durationSec / 3600)
}

function costPerTurn(estimatedCostUsd: number | null, turnCount: number): number | null {
  if (estimatedCostUsd === null || turnCount <= 0) return null
  return estimatedCostUsd / turnCount
}

function tokensPerTurn(totalTokens: number, turnCount: number): number | null {
  return turnCount > 0 ? totalTokens / turnCount : null
}

function efficiencyTotals(input: {
  durationSec: number
  turnCount: number
  estimatedCostUsd: number | null
  totalTokens: number
}): UsageEfficiencyTotals {
  return {
    durationSec: input.durationSec,
    turnCount: input.turnCount,
    costPerHourUsd: costPerHour(input.estimatedCostUsd, input.durationSec),
    costPerTurnUsd: costPerTurn(input.estimatedCostUsd, input.turnCount),
    tokensPerTurn: tokensPerTurn(input.totalTokens, input.turnCount),
  }
}

function addEfficiencyDuration(
  groups: Map<string, EfficiencyAccumulator>,
  key: string,
  turnKey: string,
  durationSec: number,
): void {
  let group = groups.get(key)
  if (!group) {
    group = createEfficiencyAccumulator()
    groups.set(key, group)
  }
  group.durationSec += durationSec
  group.turnKeys.add(turnKey)
}

function addWeightedDurations(input: {
  groups: Map<string, Map<string, number>>
  output: Map<string, EfficiencyAccumulator>
  turnKey: string
  durationSec: number
}): void {
  const groupTokens = input.groups.get(input.turnKey)
  if (!groupTokens || groupTokens.size === 0) return
  const totalTokens = [...groupTokens.values()].reduce((sum, value) => sum + value, 0)
  if (totalTokens <= 0) return

  for (const [key, tokens] of groupTokens) {
    if (tokens <= 0) continue
    addEfficiencyDuration(
      input.output,
      key,
      input.turnKey,
      input.durationSec * (tokens / totalTokens),
    )
  }
}

function addTurnGroupTokens(
  groups: Map<string, Map<string, number>>,
  turnKey: string,
  key: string | null | undefined,
  totalTokens: number,
): void {
  if (!key || totalTokens <= 0) return
  const group = groups.get(turnKey) ?? new Map<string, number>()
  group.set(key, (group.get(key) ?? 0) + totalTokens)
  groups.set(turnKey, group)
}

function efficiencyRows(
  rows: readonly {
    key: string
    label: string
    totalTokens: number
    estimatedCostUsd: number | null
  }[],
  durations: Map<string, EfficiencyAccumulator>,
): UsageEfficiencyBreakdownRow[] {
  return rows.map((row) => {
    const duration = durations.get(row.key)
    return {
      key: row.key,
      label: row.label,
      totalTokens: row.totalTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      ...efficiencyTotals({
        durationSec: duration?.durationSec ?? 0,
        turnCount: duration?.turnKeys.size ?? 0,
        estimatedCostUsd: row.estimatedCostUsd,
        totalTokens: row.totalTokens,
      }),
    }
  })
}

function buildUsageEfficiencySummary(input: {
  records: readonly UsageRecordFact[]
  summary: UsageSummary
  hookEvents: readonly HookUsageEvent[]
  now?: Date
}): UsageEfficiencySummary {
  const now = input.now ?? new Date()
  const dateKeys = denseUsageDateKeys(input.summary.periodDays, now)
  const dailyDurations = new Map(dateKeys.map((date) => [date, createEfficiencyAccumulator()]))
  const totalDuration = createEfficiencyAccumulator()
  const projectTokensByTurn = new Map<string, Map<string, number>>()
  const modelTokensByTurn = new Map<string, Map<string, number>>()
  const agentTokensByTurn = new Map<string, Map<string, number>>()
  const projectDurations = new Map<string, EfficiencyAccumulator>()
  const modelDurations = new Map<string, EfficiencyAccumulator>()
  const agentDurations = new Map<string, EfficiencyAccumulator>()
  const matchedTurnKeys = new Set<string>()

  for (const record of input.records) {
    if (!record.turnId) continue
    const turnKey = `${record.agent}:${record.turnId}`
    matchedTurnKeys.add(turnKey)
    addTurnGroupTokens(projectTokensByTurn, turnKey, record.project, record.tokens.totalTokens)
    addTurnGroupTokens(modelTokensByTurn, turnKey, record.model, record.tokens.totalTokens)
    addTurnGroupTokens(agentTokensByTurn, turnKey, record.agent, record.tokens.totalTokens)
  }

  for (const event of input.hookEvents) {
    if (
      event.event_type !== 'turn_end' ||
      !event.turn_id ||
      typeof event.duration_sec !== 'number' ||
      event.duration_sec <= 0
    ) {
      continue
    }
    const turnKey = `${event.agent}:${event.turn_id}`
    if (!matchedTurnKeys.has(turnKey)) continue

    totalDuration.durationSec += event.duration_sec
    totalDuration.turnKeys.add(turnKey)

    const date = toUsageDateKey(event.ts)
    const day = dailyDurations.get(date)
    if (day) {
      day.durationSec += event.duration_sec
      day.turnKeys.add(turnKey)
    }

    addWeightedDurations({
      groups: projectTokensByTurn,
      output: projectDurations,
      turnKey,
      durationSec: event.duration_sec,
    })
    addWeightedDurations({
      groups: modelTokensByTurn,
      output: modelDurations,
      turnKey,
      durationSec: event.duration_sec,
    })
    addWeightedDurations({
      groups: agentTokensByTurn,
      output: agentDurations,
      turnKey,
      durationSec: event.duration_sec,
    })
  }

  const dailyByDate = new Map(input.summary.daily.map((day) => [day.date, day]))

  return {
    totals: efficiencyTotals({
      durationSec: totalDuration.durationSec,
      turnCount: totalDuration.turnKeys.size,
      estimatedCostUsd: input.summary.totals.estimatedCostUsd,
      totalTokens: input.summary.totals.totalTokens,
    }),
    daily: dateKeys.map((date) => {
      const duration = dailyDurations.get(date)
      const day = dailyByDate.get(date)
      return {
        date,
        ...efficiencyTotals({
          durationSec: duration?.durationSec ?? 0,
          turnCount: duration?.turnKeys.size ?? 0,
          estimatedCostUsd: day?.estimatedCostUsd ?? null,
          totalTokens: day?.totalTokens ?? 0,
        }),
      }
    }),
    byAgent: efficiencyRows(input.summary.byAgent, agentDurations),
    byModel: efficiencyRows(input.summary.byModel, modelDurations),
    byProject: efficiencyRows(input.summary.byProject, projectDurations),
  }
}

function previousUsagePeriodNow(args: Pick<UsageSummaryArgs, 'periodDays' | 'now'>): Date {
  const now = args.now ?? new Date()
  const currentRangeEnd = startOfLocalDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  )
  const currentRangeStart = currentRangeEnd - args.periodDays * 86400
  return new Date((currentRangeStart - 1) * 1000)
}

function usageCacheHitRate(tokens: UsageSummary['tokenBreakdown']): number {
  const inputTokens =
    tokens.inputTokens + tokens.cachedInputTokens + tokens.cacheCreationInputTokens
  return inputTokens > 0 ? Math.min(1, tokens.cachedInputTokens / inputTokens) : 0
}

function usageCostDeltaRatio(current: UsageSummary, previous: UsageSummary): number | null {
  if (previous.totals.recordCount <= 0) return null
  const currentCost = current.totals.estimatedCostUsd
  const previousCost = previous.totals.estimatedCostUsd
  if (currentCost === null || previousCost === null || previousCost === 0) return null
  return (currentCost - previousCost) / previousCost
}

function menubarUsagePeriodSummary(
  current: UsageSummary,
  previous: UsageSummary,
): DesktopMenubarUsagePeriodSummary {
  return {
    estimatedCostUsd: current.totals.estimatedCostUsd,
    totalTokens: current.totals.totalTokens,
    recordCount: current.totals.recordCount,
    cacheHitRate: usageCacheHitRate(current.tokenBreakdown),
    costDeltaRatio: usageCostDeltaRatio(current, previous),
  }
}

export function queryUsageSummary(args: DesktopUsageSummaryArgs): UsageSummary {
  const db = getUsageDb(args.db)
  return db.transaction(() => {
    const prices = readUsagePricingCache(db)
    const pricingStatus = pricingStatusFromCache(prices, args.now ?? new Date())
    const currentRange = usageDateRange(args)
    const previousNow = previousUsagePeriodNow(args)
    const previousRange = usageDateRange({ periodDays: args.periodDays, now: previousNow })
    const hookEvents = readHookUsageEvents(db, {
      startTs: Math.min(currentRange.rangeStart, previousRange.rangeStart) - 86400,
      endTs: Math.max(currentRange.rangeEnd, previousRange.rangeEnd) + 15 * 60,
    })
    const records = filterUsageRows(readUsageRows(db, args), args)
    const summary = buildUsageSummary(records, {
      periodDays: args.periodDays,
      now: args.now,
      agents: args.agent && args.agent !== 'all' ? [args.agent] : undefined,
      prices,
      pricingStatus,
    })
    const summaryWithEfficiency = {
      ...summary,
      efficiency: buildUsageEfficiencySummary({
        records,
        summary,
        hookEvents,
        now: args.now,
      }),
    }

    const previousRecords = filterUsageRows(readUsageRows(db, { ...args, now: previousNow }), {
      ...args,
      now: previousNow,
    })
    const previousSummary = buildUsageSummary(previousRecords, {
      periodDays: args.periodDays,
      now: previousNow,
      agents: args.agent && args.agent !== 'all' ? [args.agent] : undefined,
      prices,
      pricingStatus,
    })
    const previousSummaryWithEfficiency = {
      ...previousSummary,
      efficiency: buildUsageEfficiencySummary({
        records: previousRecords,
        summary: previousSummary,
        hookEvents,
        now: previousNow,
      }),
    }

    return {
      ...summaryWithEfficiency,
      periodCompare: buildUsagePeriodCompare(summaryWithEfficiency, previousSummaryWithEfficiency),
    }
  })()
}

export function queryMenubarUsageSummary(now: Date = new Date()): DesktopMenubarUsageSummary {
  const db = getUsageDb()
  return db.transaction(() => {
    const prices = readUsagePricingCache(db)
    const pricingStatus = pricingStatusFromCache(prices, now)
    const thirtyDayRecords = readUsageRows(db, { periodDays: 30, now })
    const thirtyDaySummary = buildUsageSummary(thirtyDayRecords, {
      periodDays: 30,
      now,
      prices,
      pricingStatus,
    })

    const sevenDayStart =
      startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) - 7 * 86400
    const sevenDayRecords = thirtyDayRecords.filter(
      (record) => typeof record.ts === 'number' && record.ts >= sevenDayStart,
    )
    const sevenDaySummary = buildUsageSummary(sevenDayRecords, {
      periodDays: 7,
      now,
      prices,
      pricingStatus,
    })

    const todayStart = startOfLocalDay(now)
    const todayEnd = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    const todayRecords = thirtyDayRecords.filter(
      (record) => typeof record.ts === 'number' && record.ts >= todayStart && record.ts < todayEnd,
    )
    const yesterdayRecords = thirtyDayRecords.filter(
      (record) =>
        typeof record.ts === 'number' && record.ts >= todayStart - 86400 && record.ts < todayStart,
    )
    const todaySummary = buildUsageSummary(todayRecords, {
      periodDays: 7,
      now,
      prices,
      pricingStatus,
    })
    const yesterdaySummary = buildUsageSummary(yesterdayRecords, {
      periodDays: 7,
      now,
      prices,
      pricingStatus,
    })

    const previousSevenDayNow = previousUsagePeriodNow({ periodDays: 7, now })
    const previousSevenDaySummary = buildUsageSummary(
      readUsageRows(db, { periodDays: 7, now: previousSevenDayNow }),
      {
        periodDays: 7,
        now: previousSevenDayNow,
        prices,
        pricingStatus,
      },
    )
    const previousThirtyDayNow = previousUsagePeriodNow({ periodDays: 30, now })
    const previousThirtyDaySummary = buildUsageSummary(
      readUsageRows(db, { periodDays: 30, now: previousThirtyDayNow }),
      {
        periodDays: 30,
        now: previousThirtyDayNow,
        prices,
        pricingStatus,
      },
    )

    return {
      today: menubarUsagePeriodSummary(todaySummary, yesterdaySummary),
      last7Days: menubarUsagePeriodSummary(sevenDaySummary, previousSevenDaySummary),
      last30Days: menubarUsagePeriodSummary(thirtyDaySummary, previousThirtyDaySummary),
    }
  })()
}

function shouldDedupeUsageRefresh(options: UsageRefreshOptions): boolean {
  return options.db === undefined && options.homeDir === undefined && options.env === undefined
}

function usesDefaultAppRefreshPath(options: UsageRefreshOptions): boolean {
  return options.useDefaultAppRefreshPath === true || shouldDedupeUsageRefresh(options)
}

function usageRefreshResultForPush(result: DesktopUsageRefreshResult) {
  return {
    ...result,
    pricingStatus:
      result.pricingStatus === 'unavailable'
        ? ('refresh_failed_without_cache' as const)
        : result.pricingStatus,
  }
}

export function queryUsageRefreshState() {
  if (defaultUsageRefreshInFlight || defaultUsageRefreshScheduled) {
    return {
      status: 'loading' as const,
      error: null,
      lastResult: lastDefaultUsageRefreshResult,
    }
  }

  if (lastDefaultUsageRefreshError) {
    return {
      status: 'error' as const,
      error: lastDefaultUsageRefreshError,
      lastResult: lastDefaultUsageRefreshResult,
    }
  }

  return {
    status: lastDefaultUsageRefreshResult ? ('success' as const) : ('idle' as const),
    error: null,
    lastResult: lastDefaultUsageRefreshResult,
  }
}

async function runUsageRefreshOnce(
  options: UsageRefreshOptions = {},
): Promise<DesktopUsageRefreshResult> {
  const db = getUsageDb(options.db)
  const homeDir = options.homeDir ?? homedir()
  const refreshPricing = options.refreshPricing ?? true
  const scannedAt = nowSeconds()
  const defaultAppRefreshPath = usesDefaultAppRefreshPath(options)
  const discoveredFiles = defaultAppRefreshPath
    ? await discoverSourceFilesAsync(homeDir, options.env ?? process.env)
    : discoverSourceFiles(homeDir, options.env ?? process.env)
  const scanState = readUsageScanStateMap(db)
  const changedFiles = changedSourceFiles(scanState, discoveredFiles)
  const scanScope = defaultAppRefreshPath
    ? await scanScopeSourceFilesAsync(discoveredFiles, changedFiles)
    : {
        files: scanScopeSourceFiles(discoveredFiles, changedFiles),
        needsGlobalScanContext: changedFiles.some(fileNeedsGlobalScanContext),
      }
  const files = scanScope.files
  const hookFingerprint = readHookUsageFingerprint(db)
  const needsGlobalScanContext = scanScope.needsGlobalScanContext
  const scannedSourceFiles = new Set<string>()
  const projectCache = new Map<string, string | null>()
  const projectMetaCache = new Map<string, NonNullable<UsageRecordFact['meta']> | undefined>()
  const fileBatchSize =
    scanState.size === 0 ? USAGE_INITIAL_REFRESH_FILE_BATCH_SIZE : USAGE_REFRESH_FILE_BATCH_SIZE
  const scanBatches =
    defaultAppRefreshPath && !needsGlobalScanContext ? chunkArray(files, fileBatchSize) : [files]
  let recordsFound = 0
  let recordsInserted = deleteMissingSourceFileRecords(db, discoveredFiles)
  let lastProgressNotifyAtMs = 0

  for (const batch of scanBatches) {
    if (batch.length === 0) continue
    const batchScanState = scanStateForFiles(scanState, batch)
    const { records, states, replaceStates } = defaultAppRefreshPath
      ? await scanSourceFilesOffMainThread(batch, batchScanState)
      : scanSourceFiles(batch, batchScanState)
    recordsFound += records.length
    for (const state of states) scannedSourceFiles.add(`${state.agent}:${state.sourceFileKey}`)
    await yieldToEventLoop()
    const tierAnnotatedRecords = annotateCodexPriorityRecords(
      records,
      homeDir,
      options.env ?? process.env,
    )
    await yieldToEventLoop()
    const projectResolvedRecords = await resolveUsageRecordProjectsChunked(
      tierAnnotatedRecords,
      homeDir,
      projectCache,
      projectMetaCache,
    )
    const hookEvents = readHookUsageEventsForRecords(db, projectResolvedRecords)
    const reconciledNewRecords = reconcileUsageWithHookEvents(projectResolvedRecords, hookEvents)
    const batchInserted = await writeUsageRefreshBatchChanges(db, {
      states,
      replaceStates,
      records: reconciledNewRecords,
    })
    recordsInserted += batchInserted
    const nowMs = Date.now()
    if (
      defaultAppRefreshPath &&
      batchInserted > 0 &&
      nowMs - lastProgressNotifyAtMs >= USAGE_PROGRESS_NOTIFY_INTERVAL_MS
    ) {
      notifyUsageRenderer({ type: 'usage-changed' })
      lastProgressNotifyAtMs = nowMs
    }
    await yieldToEventLoop()
  }

  const shouldReconcileExisting =
    lastExistingUsageReconcileFingerprint !== null &&
    lastExistingUsageReconcileFingerprint !== hookFingerprint
  const existingUnattributed = shouldReconcileExisting
    ? readUnattributedUsageRows(db).filter(
        (record) => !scannedSourceFiles.has(`${record.agent}:${record.sourceFileKey}`),
      )
    : []
  const resolvedExistingRecords =
    existingUnattributed.length > 0
      ? await resolveUsageRecordProjectsChunked(
          existingUnattributed,
          homeDir,
          projectCache,
          projectMetaCache,
        )
      : []
  const reconciledExistingRecords =
    resolvedExistingRecords.length > 0
      ? reconcileUsageWithHookEvents(
          resolvedExistingRecords,
          readHookUsageEventsForRecords(db, resolvedExistingRecords),
        ).filter((record, index) => attributionChanged(existingUnattributed[index], record))
      : []
  lastExistingUsageReconcileFingerprint = hookFingerprint

  if (reconciledExistingRecords.length > 0) {
    recordsInserted += await upsertUsageRecordsChunked(db, reconciledExistingRecords)
  }

  const pricingResult = refreshPricing
    ? await refreshPricingCache(db)
    : {
        status: pricingStatusFromCache(readUsagePricingCache(db), new Date(scannedAt * 1000)),
        changed: false,
      }
  const pricingStatus = pricingResult.status

  if (recordsInserted > 0 || pricingResult.changed) notifyUsageRenderer({ type: 'usage-changed' })

  return {
    frequency: activeUsageRefreshFrequency,
    scannedAt,
    recordsFound,
    recordsInserted,
    pricingStatus,
  }
}

export async function runUsageRefreshIngestion(
  options: UsageRefreshOptions = {},
): Promise<DesktopUsageRefreshResult> {
  return runUsageRefreshOnce(options)
}

export async function runUsageRefresh(
  options: UsageRefreshOptions = {},
): Promise<DesktopUsageRefreshResult> {
  if (!shouldDedupeUsageRefresh(options)) return runUsageRefreshOnce(options)
  if (defaultUsageRefreshInFlight) return defaultUsageRefreshInFlight

  lastDefaultUsageRefreshError = null
  notifyUsageRenderer({ type: 'usage-refresh-started' })
  const refresh = (usageRuntime.runRefreshOutOfProcess ?? runUsageRefreshOnce)(options)
    .then((result) => {
      lastDefaultUsageRefreshResult = usageRefreshResultForPush(result)
      notifyUsageRenderer({
        type: 'usage-refresh-finished',
        usageRefresh: lastDefaultUsageRefreshResult,
      })
      return result
    })
    .catch((error) => {
      lastDefaultUsageRefreshError = String(error)
      notifyUsageRenderer({ type: 'usage-refresh-finished', error: lastDefaultUsageRefreshError })
      throw error
    })
  const trackedRefresh = refresh.finally(() => {
    if (defaultUsageRefreshInFlight === trackedRefresh) defaultUsageRefreshInFlight = null
  })
  defaultUsageRefreshInFlight = trackedRefresh
  return defaultUsageRefreshInFlight
}

function currentUsageRefreshPlaceholder(
  options: UsageRefreshOptions = {},
): DesktopUsageRefreshResult {
  const db = getUsageDb(options.db)
  const scannedAt = nowSeconds()
  return {
    frequency: activeUsageRefreshFrequency,
    scannedAt,
    recordsFound: 0,
    recordsInserted: 0,
    pricingStatus: pricingStatusFromCache(readUsagePricingCache(db), new Date(scannedAt * 1000)),
  }
}

export function startUsageRefreshJob(options: UsageRefreshOptions = {}): DesktopUsageRefreshResult {
  if (!shouldDedupeUsageRefresh(options)) {
    throw new Error('Detached usage refresh only supports the default app database')
  }

  const placeholder = currentUsageRefreshPlaceholder(options)
  if (defaultUsageRefreshInFlight || defaultUsageRefreshScheduled) return placeholder

  defaultUsageRefreshScheduled = true
  setTimeout(() => {
    defaultUsageRefreshScheduled = false
    void runUsageRefresh(options).catch(() => {
      // Manual/background refresh errors are surfaced on the next explicit query.
    })
  }, 0)
  return placeholder
}

export const __usageServiceTestInternals = {
  codexTranscriptRoots,
  scanScopeSourceFiles,
  scanSourceFiles,
}

function runBackgroundUsageRefresh(): void {
  void runUsageRefresh({ refreshPricing: true }).catch(() => {
    // Background refresh is best-effort; foreground refresh surfaces errors to the UI.
  })
}

export function startUsageBackgroundRefresh(frequency: UsageRefreshFrequency): void {
  stopUsageBackgroundRefresh()
  activeUsageRefreshFrequency = frequency
  const intervalMs = frequencyToMs(frequency)
  if (intervalMs === null) return

  backgroundImmediateRefreshTimer = setTimeout(() => {
    backgroundImmediateRefreshTimer = null
    runBackgroundUsageRefresh()
  }, BACKGROUND_INITIAL_REFRESH_DELAY_MS)
  backgroundRefreshTimer = setInterval(() => {
    runBackgroundUsageRefresh()
  }, intervalMs)
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
