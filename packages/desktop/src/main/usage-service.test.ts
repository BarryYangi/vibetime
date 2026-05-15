import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeDesktopDbSchema } from './db.js'
import { readUsageRows, upsertUsageRecords } from './usage-service.js'
import type { UsageRecordFact } from '@vibetime/core'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

const dbs: Database.Database[] = []

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
  for (const db of dbs.splice(0)) db.close()
})

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
    expect(tableNames).not.toContain('usage_summaries')
    expect(tableNames).not.toContain('usage_derived_summaries')
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
