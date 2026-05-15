import {
  SCHEMA_VERSION,
  sanitizeUsageMeta,
  type UsagePricingEntry,
  type UsageRecordFact,
  type UsageScanState,
  type UsageSummaryArgs,
} from '@vibetime/core'
import type Database from 'better-sqlite3'

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
  const rangeEnd =
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() / 1000
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
