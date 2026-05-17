import { execFileSync } from 'node:child_process'
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
  readUsagePricingCache,
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
    source: 'models.dev',
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

    const pricingColumns = db.prepare('PRAGMA table_info(usage_pricing_cache)').all() as Array<{
      name: string
      pk: number
    }>
    expect(
      pricingColumns
        .filter((column) => column.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((column) => column.name),
    ).toEqual(['provider', 'model'])
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

  it('parses only appended Codex bytes after a file has scan state', () => {
    const homeDir = createTempDir()
    const sessionPath = join(homeDir, 'append-codex.jsonl')
    const sourceFileKey = testSourceFileKey('codex', sessionPath)
    const initialContent = [
      JSON.stringify({
        timestamp: '2026-05-15T10:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'append-session' },
      }),
      JSON.stringify({
        timestamp: '2026-05-15T10:00:05.000Z',
        type: 'turn_context',
        payload: { turn_id: 'append-turn', model: 'gpt-5.5' },
      }),
      JSON.stringify({
        timestamp: '2026-05-15T10:00:12.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: { input_tokens: 100, output_tokens: 40 } },
        },
      }),
    ].join('\n')
    writeFileSync(sessionPath, initialContent)

    const firstStat = statSync(sessionPath)
    const first = __usageServiceTestInternals.scanSourceFiles([
      {
        agent: 'codex',
        path: sessionPath,
        sourceFileKey,
        sourceFileBasename: basename(sessionPath),
        mtimeMs: firstStat.mtimeMs,
        sizeBytes: firstStat.size,
      },
    ])
    const firstState = first.states[0]
    expect(first.records).toHaveLength(1)
    expect(firstState?.parsedBytes).toBe(firstStat.size)

    const appendedLine = JSON.stringify({
      timestamp: '2026-05-15T10:00:20.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 25, output_tokens: 5 } },
      },
    })
    writeFileSync(sessionPath, `${initialContent}\n${appendedLine}`)
    const secondStat = statSync(sessionPath)
    const previousStates: NonNullable<
      Parameters<typeof __usageServiceTestInternals.scanSourceFiles>[1]
    > = new Map([
      [
        `${firstState.agent}:${firstState.sourceFileKey}`,
        {
          agent: firstState.agent,
          source_file_key: firstState.sourceFileKey,
          source_file_basename: firstState.sourceFileBasename,
          mtime_ms: firstState.mtimeMs,
          size_bytes: firstState.sizeBytes,
          last_scanned_at: firstState.lastScannedAt,
          last_row_key: firstState.lastRowKey ?? null,
          parsed_bytes: firstState.parsedBytes ?? null,
          scan_context: firstState.scanContext ? JSON.stringify(firstState.scanContext) : null,
        },
      ],
    ])

    const second = __usageServiceTestInternals.scanSourceFiles(
      [
        {
          agent: 'codex',
          path: sessionPath,
          sourceFileKey,
          sourceFileBasename: basename(sessionPath),
          mtimeMs: secondStat.mtimeMs,
          sizeBytes: secondStat.size,
        },
      ],
      previousStates,
    )

    expect(second.records).toHaveLength(1)
    expect(second.records[0]?.tokens).toMatchObject({ inputTokens: 25, outputTokens: 5 })
    expect(second.records[0]?.sourceRowKey).toBe(`${sourceFileKey}:3`)
    expect(second.replaceStates).toHaveLength(0)
    expect(second.states[0]?.parsedBytes).toBe(secondStat.size)
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

  it('scopes Codex roots to CODEX_HOME when configured', () => {
    const homeDir = createTempDir()
    const configuredCodexHome = join(homeDir, 'managed-codex')

    expect(__usageServiceTestInternals.codexTranscriptRoots(homeDir, {})).toEqual([
      join(homeDir, '.codex', 'sessions'),
      join(homeDir, '.codex', 'archived_sessions'),
    ])
    expect(
      __usageServiceTestInternals.codexTranscriptRoots(homeDir, {
        CODEX_HOME: configuredCodexHome,
      }),
    ).toEqual([
      join(configuredCodexHome, 'sessions'),
      join(configuredCodexHome, 'archived_sessions'),
    ])
    expect(
      __usageServiceTestInternals.codexTranscriptRoots(homeDir, {
        CODEX_HOME: '~\\managed-codex',
      }),
    ).toEqual([
      join(homeDir, 'managed-codex', 'sessions'),
      join(homeDir, 'managed-codex', 'archived_sessions'),
    ])
  })

  it('limits refresh scans to changed files unless Codex fork context is required', () => {
    const homeDir = createTempDir()
    const claudeA = join(homeDir, 'claude-a.jsonl')
    const claudeB = join(homeDir, 'claude-b.jsonl')
    const codexA = join(homeDir, 'codex-a.jsonl')
    const codexFork = join(homeDir, 'codex-fork.jsonl')
    writeFileSync(claudeA, '')
    writeFileSync(claudeB, '')
    writeFileSync(codexA, JSON.stringify({ type: 'session_meta', payload: { id: 'codex-a' } }))
    writeFileSync(
      codexFork,
      JSON.stringify({
        type: 'session_meta',
        payload: { id: 'codex-fork', forked_from_id: 'codex-a' },
      }),
    )

    const files = [
      {
        agent: 'claude-code' as const,
        path: claudeA,
        sourceFileKey: 'claude-a',
        sourceFileBasename: basename(claudeA),
        mtimeMs: 1,
        sizeBytes: 1,
      },
      {
        agent: 'claude-code' as const,
        path: claudeB,
        sourceFileKey: 'claude-b',
        sourceFileBasename: basename(claudeB),
        mtimeMs: 1,
        sizeBytes: 1,
      },
      {
        agent: 'codex' as const,
        path: codexA,
        sourceFileKey: 'codex-a',
        sourceFileBasename: basename(codexA),
        mtimeMs: 1,
        sizeBytes: 1,
      },
      {
        agent: 'codex' as const,
        path: codexFork,
        sourceFileKey: 'codex-fork',
        sourceFileBasename: basename(codexFork),
        mtimeMs: 1,
        sizeBytes: 1,
      },
    ]

    expect(
      __usageServiceTestInternals
        .scanScopeSourceFiles(files, [files[0]])
        .map((file) => file.sourceFileKey),
    ).toEqual(['claude-a'])
    expect(
      __usageServiceTestInternals
        .scanScopeSourceFiles(files, [files[2]])
        .map((file) => file.sourceFileKey),
    ).toEqual(['codex-a'])
    expect(
      __usageServiceTestInternals
        .scanScopeSourceFiles(files, [files[3]])
        .map((file) => file.sourceFileKey),
    ).toEqual(['codex-a', 'codex-fork'])
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

  it('accepts CLAUDE_CONFIG_DIR values that already point at projects directories', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    const homeDir = createTempDir()
    const projectsDir = join(homeDir, 'custom-claude', 'projects')
    mkdirSync(projectsDir, { recursive: true })
    writeFileSync(
      join(projectsDir, 'direct-projects-root.jsonl'),
      JSON.stringify({
        timestamp: '2026-05-15T10:01:00.000Z',
        sessionId: 'direct-projects-session',
        requestId: 'request-direct-projects',
        type: 'assistant',
        message: {
          id: 'message-direct-projects',
          model: 'claude-opus-4-6',
          usage: { input_tokens: 100, output_tokens: 40 },
        },
      }),
    )

    const result = await runUsageRefresh({
      db,
      homeDir,
      env: { CLAUDE_CONFIG_DIR: `${join(homeDir, 'missing')}, ${projectsDir}` },
      refreshPricing: false,
    })
    const [row] = readUsageRows(db, {
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })

    expect(result.recordsFound).toBe(1)
    expect(row).toMatchObject({
      agent: 'claude-code',
      sessionId: 'direct-projects-session',
      model: 'claude-opus-4-6',
      tokens: expect.objectContaining({ totalTokens: 140 }),
    })
  })

  it('groups Craft Agent session directories by their stable workspace parent', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    const homeDir = createTempDir()
    const claudeConfigDir = join(homeDir, '.claude')
    const claudeProjectsDir = join(claudeConfigDir, 'projects', 'craft-session')
    const craftWorkspaceDir = join(homeDir, '.craft-agent', 'workspaces', 'research')
    const craftSessionDir = join(craftWorkspaceDir, 'sessions', '260422-apt-star')
    mkdirSync(claudeProjectsDir, { recursive: true })
    mkdirSync(craftSessionDir, { recursive: true })
    writeFileSync(
      join(craftWorkspaceDir, 'config.json'),
      JSON.stringify({
        id: 'ws_research',
        name: 'Research Workspace',
        slug: 'research',
      }),
    )
    writeFileSync(
      join(craftSessionDir, 'session.jsonl'),
      `${JSON.stringify({
        id: '260422-apt-star',
        name: 'Skill Installation Help',
        workspaceRootPath: '~/.craft-agent/workspaces/research',
        sdkSessionId: 'craft-sdk-session',
        sdkCwd: '~/.craft-agent/workspaces/research/sessions/260422-apt-star',
      })}\n`,
    )
    writeFileSync(
      join(claudeProjectsDir, 'craft-sdk-session.jsonl'),
      JSON.stringify({
        timestamp: '2026-05-15T10:01:00.000Z',
        cwd: craftSessionDir,
        sessionId: 'craft-sdk-session',
        requestId: 'request-craft',
        type: 'assistant',
        message: {
          id: 'message-craft',
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 25,
            output_tokens: 40,
          },
        },
      }),
    )

    await runUsageRefresh({
      db,
      homeDir,
      env: { CLAUDE_CONFIG_DIR: claudeConfigDir },
      refreshPricing: false,
    })
    const [row] = readUsageRows(db, {
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })

    expect(row).toMatchObject({
      agent: 'claude-code',
      project: 'Craft Agent / Research Workspace',
      meta: expect.objectContaining({
        projectResolutionKind: 'wrapper_workspace',
        projectResolutionSource: 'craft-agent-session',
        wrapperName: 'Craft Agent',
        wrapperWorkspaceId: 'ws_research',
        wrapperWorkspaceName: 'Research Workspace',
        wrapperWorkspaceSlug: 'research',
        wrapperSessionId: '260422-apt-star',
        wrapperSessionName: 'Skill Installation Help',
        wrapperSessionMatch: 'sdk_session_id',
      }),
    })
  })

  it('lifts generated workspace leaf directories to their stable parent project', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    const homeDir = createTempDir()
    const claudeConfigDir = join(homeDir, '.claude')
    const claudeProjectsDir = join(claudeConfigDir, 'projects', 'generated-workspace')
    const projectDir = join(homeDir, 'workspace', 'real-project')
    const generatedDir = join(projectDir, 'workspace', '1dd6acf8-9ec2-4197-8f2c-05ceb446d8e6')
    mkdirSync(claudeProjectsDir, { recursive: true })
    mkdirSync(generatedDir, { recursive: true })
    writeFileSync(
      join(claudeProjectsDir, 'generated.jsonl'),
      JSON.stringify({
        timestamp: '2026-05-15T10:01:00.000Z',
        cwd: generatedDir,
        sessionId: 'generated-session',
        requestId: 'request-generated',
        type: 'assistant',
        message: {
          id: 'message-generated',
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 100,
            output_tokens: 40,
          },
        },
      }),
    )

    await runUsageRefresh({
      db,
      homeDir,
      env: { CLAUDE_CONFIG_DIR: claudeConfigDir },
      refreshPricing: false,
    })
    const [row] = readUsageRows(db, {
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })

    expect(row).toMatchObject({
      agent: 'claude-code',
      project: 'real-project',
      meta: expect.objectContaining({
        projectResolutionKind: 'generated_parent',
        projectResolutionSource: 'generated-workspace-parent',
      }),
    })
  })

  it('scans Codex archived_sessions alongside active sessions', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    const homeDir = createTempDir()
    const codexHome = join(homeDir, '.codex')
    const activeDir = join(codexHome, 'sessions', '2026', '05', '15')
    const archivedDir = join(codexHome, 'archived_sessions', '2026', '05', '14')
    mkdirSync(activeDir, { recursive: true })
    mkdirSync(archivedDir, { recursive: true })
    writeFileSync(
      join(activeDir, 'active.jsonl'),
      JSON.stringify({
        timestamp: '2026-05-15T10:20:12.000Z',
        type: 'token_count',
        session_id: 'active-session',
        turn_id: 'active-turn',
        model: 'gpt-5.5',
        last_token_usage: { input_tokens: 100, output_tokens: 40 },
      }),
    )
    writeFileSync(
      join(archivedDir, 'archived.jsonl'),
      JSON.stringify({
        timestamp: '2026-05-14T10:20:12.000Z',
        type: 'token_count',
        session_id: 'archived-session',
        turn_id: 'archived-turn',
        model: 'gpt-5.5',
        last_token_usage: { input_tokens: 200, output_tokens: 50 },
      }),
    )

    const result = await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome },
      refreshPricing: false,
    })
    const rows = readUsageRows(db, { periodDays: 7, now: new Date('2026-05-15T12:00:00.000Z') })

    expect(result.recordsFound).toBe(2)
    expect(rows.map((row) => row.sessionId).sort()).toEqual(['active-session', 'archived-session'])
  })

  it('rescans Codex with parent context when a new forked session appears', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    const homeDir = createTempDir()
    const codexHome = join(homeDir, '.codex')
    const sessionDir = join(codexHome, 'sessions', '2026', '05', '15')
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(
      join(sessionDir, 'parent.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-05-15T10:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'parent-session' },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T10:00:05.000Z',
          type: 'turn_context',
          payload: { turn_id: 'parent-turn', model: 'gpt-5.5' },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T10:00:12.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 10,
              },
            },
          },
        }),
      ].join('\n'),
    )

    await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome },
      refreshPricing: false,
    })
    writeFileSync(
      join(sessionDir, 'child.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-05-15T10:05:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'child-session',
            forked_from_id: 'parent-session',
            timestamp: '2026-05-15T10:05:00.000Z',
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T10:05:05.000Z',
          type: 'turn_context',
          payload: { turn_id: 'child-turn', model: 'gpt-5.5' },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T10:05:12.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              total_token_usage: {
                input_tokens: 130,
                cached_input_tokens: 20,
                output_tokens: 15,
              },
            },
          },
        }),
      ].join('\n'),
    )

    const second = await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome },
      refreshPricing: false,
    })
    const rows = readUsageRows(db, { periodDays: 7, now: new Date('2026-05-15T12:00:00.000Z') })

    expect(second.recordsFound).toBe(2)
    expect(rows.map((row) => [row.sessionId, row.tokens.totalTokens])).toEqual([
      ['parent-session', 110],
      ['child-session', 35],
    ])
    expect(rows.reduce((sum, row) => sum + row.tokens.totalTokens, 0)).toBe(145)
  })

  it('resolves git projects when the primary remote is not named origin', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)

    const homeDir = createTempDir()
    const codexHome = join(homeDir, '.codex')
    const archivedDir = join(codexHome, 'archived_sessions')
    const projectDir = join(homeDir, 'workspace', 'sider-video-agent')
    mkdirSync(archivedDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    execFileSync('git', ['-C', projectDir, 'init'], { stdio: 'ignore' })
    execFileSync(
      'git',
      [
        '-C',
        projectDir,
        'remote',
        'add',
        'sider-video-agent',
        'https://github.com/Sider-ai/sider-video-agent.git',
      ],
      { stdio: 'ignore' },
    )
    writeFileSync(
      join(archivedDir, 'non-origin-remote.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-05-15T10:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session',
            cwd: projectDir,
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T10:20:12.000Z',
          type: 'token_count',
          session_id: 'codex-session',
          turn_id: 'codex-turn',
          model: 'gpt-5.5',
          last_token_usage: { input_tokens: 100, output_tokens: 40 },
        }),
      ].join('\n'),
    )

    await runUsageRefresh({
      db,
      homeDir,
      env: { CODEX_HOME: codexHome },
      refreshPricing: false,
    })
    const [row] = readUsageRows(db, {
      periodDays: 7,
      now: new Date('2026-05-15T12:00:00.000Z'),
    })

    expect(row).toMatchObject({
      project: 'Sider-ai/sider-video-agent',
      meta: expect.objectContaining({
        projectResolutionKind: 'git',
        projectResolutionSource: 'nearest-git-remote',
      }),
    })
  })

  it('refreshes models.dev pricing and falls back to cached or unavailable status on failure', async () => {
    const successDb = createDb()
    initializeDesktopDbSchema(successDb)
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        providers: {
          openai: {
            id: 'openai',
            models: {
              'gpt-5-codex': {
                id: 'gpt-5-codex',
                cost: {
                  input: 1,
                  output: 10,
                },
              },
            },
          },
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
    upsertUsagePricingCache(cachedDb, [pricingEntry({ fetchedAt: '2000-01-01T00:00:00.000Z' })])
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
      'https://models.dev/api.json',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(success.pricingStatus).toBe('fresh')
    expect(cached.pricingStatus).toBe('cached')
    expect(unavailable.pricingStatus).toBe('unavailable')
  })

  it('uses fresh cached models.dev pricing without network refresh', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)
    vi.stubGlobal('fetch', fetchMock)
    upsertUsagePricingCache(db, [pricingEntry({ fetchedAt: new Date().toISOString() })])

    const result = await runUsageRefresh({
      db,
      homeDir: createTempDir(),
      env: {},
      refreshPricing: true,
    })

    expect(result.pricingStatus).toBe('fresh')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps stale pricing cache when a models.dev refresh returns a partial catalog', async () => {
    const db = createDb()
    initializeDesktopDbSchema(db)
    vi.stubGlobal('fetch', fetchMock)
    upsertUsagePricingCache(db, [
      pricingEntry({ model: 'gpt-5-codex', fetchedAt: '2026-01-01T00:00:00.000Z' }),
      pricingEntry({
        model: 'claude-sonnet-4-5',
        provider: 'anthropic',
        inputUsdPerMillion: 3,
        outputUsdPerMillion: 15,
        fetchedAt: '2026-01-01T00:00:00.000Z',
      }),
    ])
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        providers: {
          openai: {
            id: 'openai',
            models: {
              'gpt-5-codex': {
                id: 'gpt-5-codex',
                cost: {
                  input: 1,
                  output: 10,
                },
              },
            },
          },
        },
      }),
    })

    const result = await runUsageRefresh({
      db,
      homeDir: createTempDir(),
      env: {},
      refreshPricing: true,
    })

    expect(result.pricingStatus).toBe('cached')
    expect(readUsagePricingCache(db).map((entry) => `${entry.provider}/${entry.model}`)).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5-codex',
    ])
  })
})

describe('queryUsageSummary', () => {
  it('uses cached pricing while preserving unknown-price audit rows', () => {
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
        expect.objectContaining({ label: 'Cost unknown for this model' }),
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

    startUsageBackgroundRefresh('2m')
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 60_000)
    expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 2 * 60 * 1000)

    startUsageBackgroundRefresh('5m')
    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 60_000)
    expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 5 * 60 * 1000)
  })

  it('disables background timers for manual usage refresh', () => {
    vi.useFakeTimers()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    startUsageBackgroundRefresh('manual')

    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })
})
