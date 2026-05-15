import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { UsagePricingEntry, UsageRecordFact } from '@vibetime/core'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeDesktopDbSchema } from './db.js'
import {
  __usageServiceTestInternals,
  queryUsageSummary,
  readUsageRows,
  runUsageRefresh,
  startUsageBackgroundRefresh,
  stopUsageBackgroundRefresh,
  upsertUsagePricingCache,
  upsertUsageRecords,
} from './usage-service.js'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

const dbs: Database.Database[] = []
const fetchMock = vi.fn()

function createDb(): Database.Database {
  const db = new Database(':memory:')
  dbs.push(db)
  return db
}

function usageRecord(overrides: Partial<UsageRecordFact> = {}): UsageRecordFact {
  return {
    agent: 'codex',
    sourceFileKey: 'codex:fixture:session.jsonl',
    sourceFileBasename: 'session.jsonl',
    sourceRowKey: 'row-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    project: null,
    ts: 1778814000,
    model: 'gpt-5-codex',
    tokens: {
      inputTokens: 100,
      cachedInputTokens: 25,
      cacheCreationInputTokens: 0,
      outputTokens: 40,
      reasoningOutputTokens: 10,
      totalTokens: 175,
    },
    attributionMethod: 'unmatched',
    attributionConfidence: 0,
    meta: { sourceKind: 'test' },
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  for (const db of dbs.splice(0)) db.close()
})

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'vibetime-usage-'))
}

function pricingEntry(overrides: Partial<UsagePricingEntry> = {}): UsagePricingEntry {
  return {
    model: 'gpt-5-codex',
    provider: 'openai',
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    cacheCreationInputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    reasoningOutputUsdPerMillion: 10,
    source: 'litellm',
    fetchedAt: '2026-05-15T00:00:00.000Z',
    rawVersion: 'fixture',
    ...overrides,
  }
}

function testSourceFileKey(agent: UsageRecordFact['agent'], path: string): string {
  const hash = createHash('sha256').update(path).digest('hex').slice(0, 16)
  return `${agent}:${hash}:${basename(path)}`
}

function insertHookRows(db: Database.Database): void {
  db.prepare(`
    INSERT INTO events (
      schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta
    )
    VALUES (1, 'codex', 'turn_end', 'vibetime', 'codex-session-1', 'codex-turn-1', 1778840472, 'Asia/Shanghai', 120, '{}')
  `).run()
  db.prepare(`
    INSERT INTO open_turns (turn_id, agent, project, session_id, started_at, timezone, meta)
    VALUES ('claude-turn-open', 'claude-code', 'vibetime', 'claude-session-open', 1778840300, 'Asia/Shanghai', '{}')
  `).run()
}

describe('desktop usage storage', () => {
  it('initializes usage tables idempotently without derived summary tables', () => {
    const db = createDb()

    initializeDesktopDbSchema(db)
    initializeDesktopDbSchema(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((table) => table.name)

    expect(tableNames).toContain('usage_records')
    expect(tableNames).toContain('usage_scan_state')
    expect(tableNames).toContain('usage_pricing_cache')
    expect(tableNames).not.toContain(`usage_${'summaries'}`)
    expect(tableNames).not.toContain(`usage_derived_${'summaries'}`)
  })

  it('upserts duplicate usage facts by source identity', () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    upsertUsageRecords(db, [usageRecord()])
    upsertUsageRecords(db, [
      usageRecord({
        tokens: {
          inputTokens: 200,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 0,
          outputTokens: 70,
          reasoningOutputTokens: 0,
          totalTokens: 270,
        },
      }),
    ])

    const count = db.prepare('SELECT COUNT(*) AS count FROM usage_records').get() as {
      count: number
    }
    const [row] = readUsageRows(db, { periodDays: 7, now: new Date('2026-05-15T12:00:00.000Z') })

    expect(count.count).toBe(1)
    expect(row?.tokens.totalTokens).toBe(270)
    expect(row?.sourceFileBasename).toBe('session.jsonl')
  })
})

describe('runUsageRefresh', () => {
  it('does not mark unreadable source files as scanned', () => {
    const result = __usageServiceTestInternals.scanSourceFiles([
      {
        agent: 'codex',
        path: join(createTempDir(), 'missing-session.jsonl'),
        sourceFileKey: 'codex:missing:missing-session.jsonl',
        sourceFileBasename: 'missing-session.jsonl',
        mtimeMs: 1,
        sizeBytes: 123,
      },
    ])

    expect(result.records).toEqual([])
    expect(result.states).toEqual([])
  })

  it('scans configured Claude and Codex roots incrementally and leaves Unassigned usage auditable', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)
    insertHookRows(db)

    const homeDir = createTempDir()
    const codexHome = join(homeDir, '.codex')
    const claudeConfigDir = join(homeDir, '.claude')
    const codexSessionDir = join(codexHome, 'sessions', '2026', '05', '15')
    const claudeProjectsDir = join(claudeConfigDir, 'projects', 'vibetime')
    mkdirSync(codexSessionDir, { recursive: true })
    mkdirSync(claudeProjectsDir, { recursive: true })
    writeFileSync(
      join(codexSessionDir, 'codex-session-1.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-05-15T10:20:00.000Z',
          type: 'session_meta',
          session_id: 'codex-session-1',
          turn_id: 'codex-turn-1',
          model: 'gpt-5-codex',
        }),
        JSON.stringify({
          timestamp: '2026-05-15T10:20:12.000Z',
          type: 'token_count',
          session_id: 'codex-session-1',
          turn_id: 'codex-turn-1',
          last_token_usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
        }),
      ].join('\n'),
    )
    writeFileSync(
      join(claudeProjectsDir, 'claude-session-open.jsonl'),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-05-15T10:19:10.000Z',
        sessionId: 'claude-session-open',
        requestId: 'request-1',
        message: {
          id: 'message-1',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 50, output_tokens: 25 },
        },
      }),
    )

    const first = await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeConfigDir },
      refreshPricing: false,
    })
    const second = await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeConfigDir },
      refreshPricing: false,
    })
    const rows = readUsageRows(db, { periodDays: 7, now: new Date('2026-05-15T12:00:00.000Z') })

    expect(first.recordsFound).toBe(2)
    expect(second.recordsFound).toBe(0)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'codex',
          project: 'vibetime',
          turnId: 'codex-turn-1',
          attributionMethod: 'turn_id',
          attributionConfidence: 1,
        }),
        expect.objectContaining({
          agent: 'claude-code',
          project: 'vibetime',
          turnId: 'claude-turn-open',
          attributionMethod: 'session_time_window',
          attributionConfidence: 0.8,
        }),
      ]),
    )
  })

  it('reattributes existing unmatched usage rows after hook events arrive later', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)
    upsertUsageRecords(db, [
      usageRecord({
        sessionId: 'late-session',
        turnId: null,
        project: null,
        ts: 1778814000,
        attributionMethod: 'unmatched',
        attributionConfidence: 0,
      }),
    ])

    const beforeHook = await runUsageRefresh({
      db,
      homeDir: createTempDir(),
      env: {},
      refreshPricing: false,
    })
    db.prepare(`
      INSERT INTO events (
        schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta
      )
      VALUES (1, 'codex', 'turn_end', 'vibetime', 'late-session', 'late-turn', 1778814060, 'Asia/Shanghai', 120, '{}')
    `).run()
    const afterHook = await runUsageRefresh({
      db,
      homeDir: createTempDir(),
      env: {},
      refreshPricing: false,
    })

    const [row] = readUsageRows(db, {
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })
    expect(beforeHook.recordsFound).toBe(0)
    expect(afterHook.recordsFound).toBe(0)
    expect(row).toMatchObject({
      project: 'vibetime',
      turnId: 'late-turn',
      sessionId: 'late-session',
      attributionMethod: 'session_time_window',
      attributionConfidence: 0.8,
    })
  })

  it('rescans old Codex files that were marked scanned before token rows were recognized', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    const homeDir = createTempDir()
    const codexHome = join(homeDir, '.codex')
    const codexSessionDir = join(codexHome, 'sessions', '2026', '05', '15')
    mkdirSync(codexSessionDir, { recursive: true })
    const sessionPath = join(codexSessionDir, 'current-codex-shape.jsonl')
    writeFileSync(
      sessionPath,
      [
        JSON.stringify({
          timestamp: '2026-05-15T03:59:00.000Z',
          type: 'session_meta',
          payload: { id: 'old-null-scan-session' },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T04:00:00.000Z',
          type: 'turn_context',
          payload: { turn_id: 'old-null-scan-turn', model: 'gpt-5.5' },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T04:00:12.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 30,
                reasoning_output_tokens: 5,
                total_tokens: 155,
              },
            },
          },
        }),
      ].join('\n'),
    )

    const stat = statSync(sessionPath)
    const sourceKey = testSourceFileKey('codex', sessionPath)
    db.prepare(`
      INSERT INTO usage_scan_state (
        agent, source_file_key, source_file_basename, mtime_ms, size_bytes, last_scanned_at, last_row_key
      )
      VALUES ('codex', ?, ?, ?, ?, 1778840000, NULL)
    `).run(sourceKey, basename(sessionPath), stat.mtimeMs, stat.size)

    const first = await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome },
      refreshPricing: false,
    })
    const second = await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome },
      refreshPricing: false,
    })
    const [row] = readUsageRows(db, {
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })
    const state = db
      .prepare('SELECT last_row_key FROM usage_scan_state WHERE agent = ? AND source_file_key = ?')
      .get('codex', sourceKey) as { last_row_key: string | null }

    expect(first.recordsFound).toBe(1)
    expect(second.recordsFound).toBe(0)
    expect(row).toMatchObject({
      sessionId: 'old-null-scan-session',
      turnId: 'old-null-scan-turn',
      model: 'gpt-5.5',
      tokens: expect.objectContaining({ totalTokens: 155 }),
    })
    expect(state.last_row_key).not.toBeNull()
  })

  it('refreshes LiteLLM pricing and falls back to cached or unavailable status on failure', async () => {
    const successDb = createDb()
    initializeDesktopDbSchema(successDb)
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        'gpt-5-codex': {
          litellm_provider: 'openai',
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.00001,
        },
      }),
    })

    const success = await runUsageRefresh({
      db: successDb,
      homeDir: createTempDir(),
      env: {},
      refreshPricing: true,
    })
    const cachedDb = createDb()
    initializeDesktopDbSchema(cachedDb)
    upsertUsagePricingCache(cachedDb, [pricingEntry()])
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const cached = await runUsageRefresh({
      db: cachedDb,
      homeDir: createTempDir(),
      env: {},
      refreshPricing: true,
    })
    const unavailableDb = createDb()
    initializeDesktopDbSchema(unavailableDb)
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const unavailable = await runUsageRefresh({
      db: unavailableDb,
      homeDir: createTempDir(),
      env: {},
      refreshPricing: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(success.pricingStatus).toBe('fresh')
    expect(cached.pricingStatus).toBe('cached')
    expect(unavailable.pricingStatus).toBe('unavailable')
  })
})

describe('queryUsageSummary', () => {
  it('uses cached pricing while preserving unknown model tokens', () => {
    const db = createDb()
    initializeDesktopDbSchema(db)
    upsertUsagePricingCache(db, [pricingEntry()])
    upsertUsageRecords(db, [
      usageRecord({
        model: 'gpt-5-codex',
        project: 'vibetime',
        attributionMethod: 'turn_id',
        attributionConfidence: 1,
      }),
      usageRecord({
        sourceRowKey: 'unknown-price-row',
        model: 'unknown-future-model',
        project: null,
        tokens: {
          inputTokens: 100,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 0,
          outputTokens: 10,
          reasoningOutputTokens: 0,
          totalTokens: 110,
        },
        attributionMethod: 'unmatched',
        attributionConfidence: 0,
      }),
    ])

    const summary = queryUsageSummary({
      db,
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })

    expect(summary.totals.totalTokens).toBe(285)
    expect(summary.totals.estimatedCostUsd).toBeGreaterThan(0)
    expect(summary.totals.unknownCostTokens).toBe(110)
    expect(summary.auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ model: 'unknown-future-model' }),
        expect.objectContaining({ label: 'Unassigned usage' }),
      ]),
    )
  })

  it('applies agent project model and includeSidechain filters from persisted rows', () => {
    const db = createDb()
    initializeDesktopDbSchema(db)
    upsertUsagePricingCache(db, [pricingEntry()])
    upsertUsageRecords(db, [
      usageRecord({
        agent: 'codex',
        sourceRowKey: 'codex-main',
        project: 'vibetime',
        model: 'gpt-5-codex',
        attributionMethod: 'turn_id',
        attributionConfidence: 1,
      }),
      usageRecord({
        agent: 'codex',
        sourceRowKey: 'codex-sidechain',
        project: 'vibetime',
        model: 'gpt-5-codex',
        meta: { sourceKind: 'test', isSidechain: true },
      }),
      usageRecord({
        agent: 'claude-code',
        sourceRowKey: 'claude-other',
        project: 'other-project',
        model: 'claude-sonnet-4-5',
      }),
    ])

    const summary = queryUsageSummary({
      db,
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
      agent: 'codex',
      project: 'vibetime',
      model: 'gpt-5-codex',
      includeSidechain: false,
    })

    expect(summary.totals.recordCount).toBe(1)
    expect(summary.availableFilters.agents).toEqual(['codex'])
    expect(summary.byProject).toEqual([expect.objectContaining({ key: 'vibetime' })])
    expect(summary.byModel).toEqual([expect.objectContaining({ key: 'gpt-5-codex' })])
  })

  it('builds project breakdown, turn attribution, and unassigned audit without network work', () => {
    const db = createDb()
    initializeDesktopDbSchema(db)
    vi.stubGlobal('fetch', fetchMock)
    upsertUsagePricingCache(db, [pricingEntry()])
    upsertUsageRecords(db, [
      usageRecord({
        sourceRowKey: 'linked-turn',
        project: 'vibetime',
        turnId: 'turn-1',
        sessionId: 'session-1',
        model: 'gpt-5-codex',
        attributionMethod: 'turn_id',
        attributionConfidence: 1,
      }),
      usageRecord({
        sourceRowKey: 'unassigned-row',
        project: null,
        turnId: null,
        sessionId: 'session-unmatched',
        attributionMethod: 'unmatched',
        attributionConfidence: 0,
      }),
    ])

    const summary = queryUsageSummary({
      db,
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(summary.byProject).toEqual([expect.objectContaining({ key: 'vibetime' })])
    expect(summary.byModel).toEqual([expect.objectContaining({ key: 'gpt-5-codex' })])
    expect(summary.auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Unassigned usage',
          attributionMethod: 'unmatched',
        }),
      ]),
    )
  })
})

describe('usage background refresh cadence', () => {
  afterEach(() => {
    stopUsageBackgroundRefresh()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clears and reschedules the timer when cadence changes', () => {
    vi.useFakeTimers()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    startUsageBackgroundRefresh('15m')
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 0)
    expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 15 * 60 * 1000)

    startUsageBackgroundRefresh('1h')
    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 0)
    expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 60 * 60 * 1000)
  })
})
