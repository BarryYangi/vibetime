# Phase 07: Usage Analytics - Pattern Map

**Mapped:** 2026-05-15  
**Files analyzed:** 40  
**Analogs found:** 34 / 40

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/core/src/schema.ts` | model/config | CRUD | `packages/core/src/schema.ts` | exact-modification |
| `packages/core/src/index.ts` | config | transform | `packages/core/src/index.ts` | exact-modification |
| `packages/core/src/usage/types.ts` | model | transform | `packages/core/src/history.ts` | role-match |
| `packages/core/src/usage/codex-scanner.ts` | service/utility | file-I/O + transform | `packages/core/src/codex-transcript.ts` | exact |
| `packages/core/src/usage/claude-scanner.ts` | service/utility | file-I/O + transform | `packages/core/src/codex-transcript.ts` | role-match |
| `packages/core/src/usage/pricing.ts` | service/utility | transform | `packages/core/src/history.ts` | flow-match |
| `packages/core/src/usage/aggregate.ts` | utility | batch + transform | `packages/core/src/history.ts` | exact |
| `packages/core/src/usage/reconcile.ts` | service/utility | batch + transform | `packages/core/src/history.ts` | role-match |
| `packages/core/src/usage/codex-scanner.test.ts` | test | file-I/O + transform | `packages/core/src/codex-transcript.test.ts` | exact |
| `packages/core/src/usage/claude-scanner.test.ts` | test | file-I/O + transform | `packages/core/src/codex-transcript.test.ts` | role-match |
| `packages/core/src/usage/pricing.test.ts` | test | transform | `packages/core/src/history.test.ts` | role-match |
| `packages/core/src/usage/reconcile.test.ts` | test | batch + transform | `packages/core/src/history.test.ts` | exact |
| `packages/core/src/usage/aggregate.test.ts` | test | batch + transform | `packages/core/src/history.test.ts` | exact |
| `packages/core/src/usage/privacy.test.ts` | test | CRUD + file-I/O | `packages/hook/src/store.test.ts` | flow-match |
| `packages/core/src/usage/__fixtures__/codex-token-count.jsonl` | test fixture | file-I/O | none | no-analog |
| `packages/core/src/usage/__fixtures__/codex-duplicate-session.jsonl` | test fixture | file-I/O | none | no-analog |
| `packages/core/src/usage/__fixtures__/claude-assistant-usage.jsonl` | test fixture | file-I/O | none | no-analog |
| `packages/core/src/usage/__fixtures__/claude-privacy-canary.jsonl` | test fixture | file-I/O | none | no-analog |
| `packages/core/src/usage/__fixtures__/pricing-cache.json` | test fixture | transform | none | no-analog |
| `packages/core/src/usage/__fixtures__/hook-events.ts` | test fixture | transform | `packages/core/src/history.test.ts` | role-match |
| `packages/desktop/src/main/usage-service.ts` | service | event-driven + file-I/O + request-response | `packages/desktop/src/main/updater.ts` + `packages/desktop/src/main/db.ts` | exact-composite |
| `packages/desktop/src/main/usage-service.test.ts` | test | event-driven + request-response | `packages/desktop/src/main/db.test.ts` | role-match |
| `packages/desktop/src/main/db.ts` | service/model | CRUD + batch | `packages/desktop/src/main/db.ts` | exact-modification |
| `packages/desktop/src/main/ipc-handlers.ts` | route/controller | request-response | `packages/desktop/src/main/ipc-handlers.ts` | exact-modification |
| `packages/desktop/src/shared/ipc-types.ts` | model | request-response | `packages/desktop/src/shared/ipc-types.ts` | exact-modification |
| `packages/desktop/src/preload/index.ts` | middleware | request-response | `packages/desktop/src/preload/index.ts` | exact-modification |
| `packages/desktop/src/main/index.ts` | config/service | event-driven | `packages/desktop/src/main/index.ts` | exact-modification |
| `packages/desktop/src/main/window-security.ts` | middleware/config | request-response | `packages/desktop/src/main/window-security.ts` | exact-modification |
| `packages/desktop/src/renderer/src/store.ts` | store | event-driven + request-response | `packages/desktop/src/renderer/src/store.ts` | exact-modification |
| `packages/desktop/src/renderer/src/usage-store.test.ts` | test | event-driven + request-response | `packages/desktop/src/renderer/src/store.test.ts` | exact |
| `packages/desktop/src/renderer/src/App.tsx` | route/provider | request-response | `packages/desktop/src/renderer/src/App.tsx` | exact-modification |
| `packages/desktop/src/renderer/src/components/Sidebar.tsx` | component | request-response | `packages/desktop/src/renderer/src/components/Sidebar.tsx` | exact-modification |
| `packages/desktop/src/renderer/src/views/Usage.tsx` | component | request-response | `packages/desktop/src/renderer/src/views/History.tsx` | exact |
| `packages/desktop/src/renderer/src/views/Settings.tsx` | component | request-response + CRUD | `packages/desktop/src/renderer/src/views/Settings.tsx` | exact-modification |
| `packages/desktop/src/renderer/src/locales/en.json` | config | transform | `packages/desktop/src/renderer/src/locales/en.json` | exact-modification |
| `packages/desktop/src/renderer/src/locales/zh.json` | config | transform | `packages/desktop/src/renderer/src/locales/zh.json` | exact-modification |
| `packages/hook/src/config.ts` | config | file-I/O | `packages/hook/src/config.ts` | exact-modification |
| `packages/hook/src/config.test.ts` | test | file-I/O | `packages/hook/src/store.test.ts` | role-match |
| `.planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` | documentation artifact | transform | none | no-analog |

## Pattern Assignments

### Core Schema And Public Exports

**Apply to:** `packages/core/src/schema.ts`, `packages/core/src/index.ts`, `packages/core/src/usage/types.ts`

**Analogs:** `packages/core/src/schema.ts`, `packages/core/src/index.ts`, `packages/core/src/history.ts`

**Schema constants pattern** (`packages/core/src/schema.ts` lines 13-46):

```typescript
export const SCHEMA_VERSION = 1 as const

export const DDL_EVENTS = `CREATE TABLE events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    agent           TEXT    NOT NULL,
    event_type      TEXT    NOT NULL,
    project         TEXT    NOT NULL,
    session_id      TEXT    NOT NULL,
    turn_id         TEXT,
    ts              REAL    NOT NULL,
    timezone        TEXT    NOT NULL,
    duration_sec    REAL,
    meta            TEXT
);` as const

export const DDL_OPEN_TURNS = `CREATE TABLE open_turns (
    turn_id     TEXT    PRIMARY KEY,
    agent       TEXT    NOT NULL,
    project     TEXT    NOT NULL,
    session_id  TEXT    NOT NULL,
    started_at  REAL    NOT NULL,
    timezone    TEXT    NOT NULL,
    meta        TEXT
);` as const

export const DDL_INDICES = [
  'CREATE INDEX idx_events_ts ON events(ts);',
  'CREATE INDEX idx_events_project ON events(project);',
  'CREATE INDEX idx_events_agent_project ON events(agent, project);',
  'CREATE INDEX idx_events_session_id ON events(session_id);',
  'CREATE INDEX idx_events_turn_id ON events(turn_id) WHERE turn_id IS NOT NULL;',
] as const
```

**Copy guidance:** add usage DDL as exported consts, not hidden strings inside desktop service. Keep DDL declarative in core; idempotency belongs to DB init by replacing `CREATE TABLE` / `CREATE INDEX` at execution time.

**Public export pattern** (`packages/core/src/index.ts` lines 1-33):

```typescript
// Public API of @vibetime/core. Imported by `hook` and `desktop` (Phase 3+).

export { adaptClaudeCode, adaptCodex, adaptCursor, adaptGeminiCli } from './adapters/index.js'
export { getAgentColorHex } from './agent-theme.js'
export type {
  CodexTranscriptCandidate,
  CodexTurnCompletion,
  FindCodexTurnCompletionInTranscriptsInput,
} from './codex-transcript.js'
export { findCodexTurnCompletionInTranscripts } from './codex-transcript.js'
export type { AdapterFn, Agent, EventType, NormalizedEvent } from './events.js'
export type {
  HistoryCalendarDay,
  HistoryEvent,
  HistoryHourlyCell,
  HistoryPeriodCompare,
  HistoryProjectAgentTotal,
  HistorySummary,
  HistoryTopProjectRow,
  HistoryTrendDay,
  HistoryTurnDuration,
} from './history.js'
export {
  buildHistorySummaryFromEvents,
  HISTORY_PERIODS,
  HISTORY_TURN_START_BUFFER_SEC,
  historyLowerBound,
  isHistoryPeriodDays,
} from './history.js'
export { DDL_EVENTS, DDL_INDICES, DDL_OPEN_TURNS, SCHEMA_VERSION } from './schema.js'
```

**Copy guidance:** usage public types and pure functions should be exported from `@vibetime/core` here, with `.js` specifiers.

**Core type shape pattern** (`packages/core/src/history.ts` lines 3-18, 65-75):

```typescript
export const HISTORY_PERIODS = [7, 30, 90, 365] as const
export type HistoryPeriodDays = (typeof HISTORY_PERIODS)[number]

export interface HistoryEvent {
  agent: string
  event_type: string
  project: string
  session_id: string
  turn_id?: string | null
  ts: number
  timezone: string
  duration_sec?: number | null
  meta?: Record<string, unknown> | string | null
}

export interface HistorySummary {
  periodDays: HistoryPeriodDays
  calendar: HistoryCalendarDay[]
  trendProjects: string[]
  trends: HistoryTrendDay[]
  topProjects: HistoryTopProjectRow[]
  hourlyMatrix: HistoryHourlyCell[]
  turnDurations: HistoryTurnDuration[]
  projectAgentTotals: HistoryProjectAgentTotal[]
  periodCompare: HistoryPeriodCompare
}
```

**Copy guidance:** define `UsageAgent = 'claude-code' | 'codex'`, token/cost/pricing status interfaces, and summary shapes in `usage/types.ts`. Do not reuse the all-agent `Agent` union for usage totals.

---

### Core Transcript Scanners

**Apply to:** `packages/core/src/usage/codex-scanner.ts`, `packages/core/src/usage/claude-scanner.ts`

**Analog:** `packages/core/src/codex-transcript.ts`

**Imports/type pattern** (`packages/core/src/codex-transcript.ts` lines 1-15):

```typescript
export interface CodexTranscriptCandidate {
  transcriptPath: string
  content: string
}

export interface FindCodexTurnCompletionInTranscriptsInput {
  turnId: string
  startedAt: number
  transcripts: CodexTranscriptCandidate[]
}

export interface CodexTurnCompletion {
  completedAt: number
  transcriptPath: string
}
```

**Core JSONL parse/error pattern** (`packages/core/src/codex-transcript.ts` lines 21-60):

```typescript
export function findCodexTurnCompletionInTranscripts(
  input: FindCodexTurnCompletionInTranscriptsInput,
): CodexTurnCompletion | null {
  for (const transcript of input.transcripts) {
    for (const line of transcript.content.split('\n')) {
      if (!line.trim()) continue

      try {
        const record = JSON.parse(line) as {
          timestamp?: string
          payload?: { type?: string; turn_id?: string; completed_at?: unknown }
        }

        const payloadType = record.payload?.type
        if (
          (payloadType !== 'task_complete' && payloadType !== 'turn_aborted') ||
          record.payload?.turn_id !== input.turnId
        ) {
          continue
        }

        const payloadCompletedAt =
          typeof record.payload.completed_at === 'number' ? record.payload.completed_at : NaN
        const timestampCompletedAt = parseTimestamp(record.timestamp)
        const completedAt =
          Number.isFinite(payloadCompletedAt) && payloadCompletedAt >= input.startedAt
            ? payloadCompletedAt
            : timestampCompletedAt

        if (!Number.isFinite(completedAt) || completedAt < input.startedAt) continue

        return { completedAt, transcriptPath: transcript.transcriptPath }
      } catch {
        // Codex transcripts can contain non-JSON diagnostic lines; ignore them.
      }
    }
  }

  return null
}
```

**Copy guidance:** scanner modules should accept transcript candidates/roots and return normalized facts plus skipped/audit facts. They should parse JSONL defensively, ignore malformed rows, and never return raw prompt/assistant/tool content.

**Desktop file discovery/cache pattern for service-facing scanners** (`packages/desktop/src/main/codex-transcript.ts` lines 14-49, 68-85):

```typescript
type TranscriptCacheEntry = {
  mtimeMs: number
  size: number
  content: string
}
const transcriptCache = new Map<string, TranscriptCacheEntry>()
const TRANSCRIPT_CACHE_MAX = 32

function readTranscriptCached(transcriptPath: string): string | null {
  try {
    const stat = statSync(transcriptPath)
    const cached = transcriptCache.get(transcriptPath)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.content
    }
    const content = readFileSync(transcriptPath, 'utf8')
    transcriptCache.set(transcriptPath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      content,
    })
    if (transcriptCache.size > TRANSCRIPT_CACHE_MAX) {
      const oldest = transcriptCache.keys().next().value
      if (oldest !== undefined) transcriptCache.delete(oldest)
    }
    return content
  } catch {
    transcriptCache.delete(transcriptPath)
    return null
  }
}

function candidateTranscriptPaths(homeDir: string, sessionId: string, startedAt: number): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  // ...
  return results
}
```

**Copy guidance:** root discovery and `mtimeMs`/`size` state belong in desktop main `usage-service.ts` or a desktop helper; core scanners stay dependency-light and testable with strings.

---

### Core Pricing, Aggregation, And Reconciliation

**Apply to:** `packages/core/src/usage/pricing.ts`, `packages/core/src/usage/aggregate.ts`, `packages/core/src/usage/reconcile.ts`

**Analog:** `packages/core/src/history.ts`

**Validation helper pattern** (`packages/core/src/history.ts` lines 77-85):

```typescript
export function isHistoryPeriodDays(value: number): value is HistoryPeriodDays {
  return (HISTORY_PERIODS as readonly number[]).includes(value)
}

export function historyLowerBound(rangeEnd: number, periodDays: HistoryPeriodDays): number {
  const calendarStart = rangeEnd - 365 * 86400
  const previousPeriodStart = rangeEnd - 2 * periodDays * 86400
  return Math.min(calendarStart, previousPeriodStart)
}
```

**Meta parsing pattern** (`packages/core/src/history.ts` lines 87-99):

```typescript
function parseEventMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta) return null
  if (typeof meta === 'object' && !Array.isArray(meta)) return meta as Record<string, unknown>
  if (typeof meta !== 'string') return null
  try {
    const parsed = JSON.parse(meta)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
```

**Batch aggregation pattern** (`packages/core/src/history.ts` lines 198-215, 225-247, 331-377):

```typescript
export function buildHistorySummaryFromEvents(
  events: HistoryEvent[],
  options: { periodDays: HistoryPeriodDays; now?: Date },
): HistorySummary {
  const now = options.now ?? new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const rangeEnd = startOfLocalDay(tomorrow)
  const calendarStart = rangeEnd - 365 * 86400
  const periodStart = rangeEnd - options.periodDays * 86400
  const turnStarts = buildTurnStarts(events)
  const calendarTotals = new Map(denseDateKeys(365, now).map((date) => [date, 0]))
  const periodProjectTotals = new Map<string, number>()

  for (const ev of completedTurnEventsInWindow(events, calendarStart, rangeEnd)) {
    if (isUnknownDurationEnd(ev)) continue
    const periodDuration = completedDuration(ev, turnStarts, periodStart, rangeEnd)
    if (periodDuration === null || periodDuration <= 0) continue
    currentPeriodTotal += periodDuration
    periodProjectTotals.set(ev.project, (periodProjectTotals.get(ev.project) ?? 0) + periodDuration)
  }

  return {
    periodDays: options.periodDays,
    calendar: [...calendarTotals.entries()].map(([date, total]) => ({ date, total })),
    trendProjects,
    trends: [...trendProjectDayTotals.entries()].map(([date, projects]) => ({
      date,
      projects: Object.fromEntries(projects),
    })),
    topProjects: [...topProjectRows.values()]
      .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project))
      .map((row) => ({
        project: row.project,
        total: row.total,
        turns: row.turns.size,
        lastActive: row.lastActive,
      })),
    periodCompare: {
      currentTotal: currentPeriodTotal,
      previousTotal: previousPeriodTotal,
      delta: currentPeriodTotal - previousPeriodTotal,
      deltaRatio:
        previousPeriodTotal > 0
          ? (currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal
          : null,
    },
  }
}
```

**Copy guidance:** `aggregate.ts` should build dense daily rows, sorted breakdowns, nullable cost totals, unknown-price counts, and unassigned rows from normalized usage records. `reconcile.ts` should be pure: input usage records + hook events/open turns, output attribution fields. Pricing must return `null` for unknown model cost, never zero.

---

### Core And Storage Tests

**Apply to:** `packages/core/src/usage/*.test.ts`, `packages/core/src/usage/__fixtures__/hook-events.ts`

**Analogs:** `packages/core/src/codex-transcript.test.ts`, `packages/core/src/history.test.ts`, `packages/hook/src/store.test.ts`

**Vitest parser fixture pattern** (`packages/core/src/codex-transcript.test.ts` lines 1-30, 100-123):

```typescript
import { describe, expect, it } from 'vitest'
import { findCodexTurnCompletionInTranscripts } from './codex-transcript.js'

describe('findCodexTurnCompletionInTranscripts', () => {
  it('finds task_complete for the target turn', () => {
    expect(
      findCodexTurnCompletionInTranscripts({
        turnId: 'turn-1',
        startedAt: 1778059801,
        transcripts: [
          {
            transcriptPath: '/tmp/session-1.jsonl',
            content: [
              JSON.stringify({ timestamp: '2026-05-06T09:30:01.935Z' }),
              JSON.stringify({ timestamp: '2026-05-06T09:30:04.043Z' }),
            ].join('\n'),
          },
        ],
      }),
    ).toEqual({ completedAt: 1778059804, transcriptPath: '/tmp/session-1.jsonl' })
  })

  it('ignores malformed transcript lines', () => {
    expect(/* ... */).toEqual({
      completedAt: 1778059804,
      transcriptPath: '/tmp/session-4.jsonl',
    })
  })
})
```

**Aggregation test factory pattern** (`packages/core/src/history.test.ts` lines 1-36, 38-64):

```typescript
import { describe, expect, it } from 'vitest'
import { buildHistorySummaryFromEvents, type HistoryEvent, isHistoryPeriodDays } from './history.js'

function makeCompletedTurn(input: {
  project: string
  turnId: string
  start: number
  end: number
  agent?: string
}): HistoryEvent[] {
  const agent = input.agent ?? 'codex'
  return [
    { agent, event_type: 'turn_start', project: input.project, session_id: 'session-1', turn_id: input.turnId, ts: input.start, timezone: 'Asia/Shanghai', duration_sec: null, meta: null },
    { agent, event_type: 'turn_end', project: input.project, session_id: 'session-1', turn_id: input.turnId, ts: input.end, timezone: 'Asia/Shanghai', duration_sec: input.end - input.start, meta: null },
  ]
}

describe('buildHistorySummaryFromEvents', () => {
  it('returns the GUI History summary shape from completed turns', () => {
    const now = new Date(2026, 4, 7, 12, 0, 0)
    const end = Math.floor(now.getTime() / 1000)
    const events = makeCompletedTurn({ project: 'alpha', turnId: 'turn-1', start: end - 25 * 60, end })
    const summary = buildHistorySummaryFromEvents(events, { periodDays: 30, now })
    expect(summary.periodDays).toBe(30)
    expect(summary.calendar).toHaveLength(365)
  })
})
```

**SQLite/privacy test setup pattern** (`packages/hook/src/store.test.ts` lines 4-18, 41-48, 97-163):

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tmpDir: string
let dbPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vibetime-store-test-'))
  dbPath = join(tmpDir, 'test.db')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('openDatabase — schema creation (STORE-02)', () => {
  it('creates events table with correct columns', () => {
    const db = openDatabase(dbPath)
    try {
      const info = db.query('PRAGMA table_info(events)').all() as Array<{ name: string }>
      const colNames = info.map((c) => c.name)
      expect(colNames).toContain('id')
    } finally {
      closeDatabase(db)
    }
  })
})
```

**Copy guidance:** core usage tests use Vitest, not Bun. For privacy tests needing SQLite, prefer `better-sqlite3` in desktop tests or pure serializer assertions in core to preserve `@vibetime/core` zero-dependency rule (`package.json` lines 16-19 and `packages/core/package.json` lines 18-22).

---

### Desktop Main DB And Background Usage Service

**Apply to:** `packages/desktop/src/main/usage-service.ts`, `packages/desktop/src/main/db.ts`, `packages/desktop/src/main/index.ts`, `packages/desktop/src/main/usage-service.test.ts`

**Analogs:** `packages/desktop/src/main/db.ts`, `packages/desktop/src/main/updater.ts`, `packages/desktop/src/main/db.test.ts`

**DB init pattern** (`packages/desktop/src/main/db.ts` lines 54-69):

```typescript
export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true, mode: 0o700 })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    db.pragma('foreign_keys = ON')
    db.exec(DDL_EVENTS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
    db.exec(DDL_OPEN_TURNS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
    for (const idx of DDL_INDICES) {
      db.exec(idx.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'))
    }
  }
  return db
}
```

**Background loop pattern** (`packages/desktop/src/main/db.ts` lines 124-147):

```typescript
function runReconcileOnce(): void {
  try {
    const handle = getDb()
    reconcileCodexCompletedTurns(handle)
    discardInactiveOpenTurns(handle)
  } catch (err) {
    // Reconcile is best-effort. A failure must not affect read paths or crash
    // the main process — log and move on.
    logger.error('reconcile loop failed', err)
  }
}

export function startReconcileLoop(): void {
  if (reconcileTimer) return
  // Immediate kickoff so the first UI read after launch sees fresh data.
  runReconcileOnce()
  reconcileTimer = setInterval(runReconcileOnce, RECONCILE_INTERVAL_MS)
}
```

**Transactional write + sanitized meta pattern** (`packages/desktop/src/main/db.ts` lines 169-194):

```typescript
const reconcileTurn = db.transaction(
  (turn: (typeof openTurns)[number], completedAt: number, transcriptPath: string) => {
    if (hasTurnEnd.get(turn.turn_id)) {
      deleteOpenTurn.run(turn.turn_id)
      return
    }

    insertTurnEnd.run({
      agent: 'codex',
      project: turn.project,
      session_id: turn.session_id,
      turn_id: turn.turn_id,
      ts: completedAt,
      timezone: turn.timezone,
      duration_sec: Math.max(0, completedAt - turn.started_at),
      meta: JSON.stringify({
        reason: 'codex_task_complete_fallback',
        transcript_file: basename(transcriptPath),
      }),
    })
    deleteOpenTurn.run(turn.turn_id)
  },
)
```

**Pure read path pattern** (`packages/desktop/src/main/db.ts` lines 337-349, 451-470):

```typescript
export function queryHistorySummary(options: { periodDays: HistoryPeriodDays }): HistorySummary {
  const db = getDb()
  // Reconcile runs on a background tick (see startReconcileLoop). Read paths
  // stay pure — no file I/O, no writes — so opening History never blocks on
  // transcript scanning.

  return db.transaction(() => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const rangeEnd = startOfLocalDay(tomorrow)
    const events = queryEventsForHistory(db, rangeEnd, options.periodDays)
    return buildHistorySummaryFromEvents(events, { periodDays: options.periodDays, now })
  })()
}
```

**Network/cache refresh pattern** (`packages/desktop/src/main/updater.ts` lines 177-205, 213-265):

```typescript
async function fetchLatestReleaseVersion(): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)

  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `VibeTime/${app.getVersion()}`,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`GitHub release check failed: ${response.status}`)
    }

    const data = (await response.json()) as { tag_name?: unknown; name?: unknown }
    const version =
      typeof data.tag_name === 'string'
        ? data.tag_name
        : typeof data.name === 'string'
          ? data.name
          : ''
    if (!version) throw new Error('Latest release has no version tag')
    return normalizeVersion(version)
  } finally {
    clearTimeout(timeout)
  }
}

async function checkForUpdates(interactive: boolean): Promise<AppUpdateState> {
  if (updateState.status === 'checking') return getUpdateState()
  const previousState = getUpdateState()
  setUpdateState({ status: 'checking', error: null })
  try {
    const latestVersion = await resolveLatestVersion()
    // success updates state
  } catch (error) {
    const message = errorMessage(error)
    const keepAvailable = previousState.status === 'available' && previousState.availableVersion
    setUpdateState({
      status: keepAvailable ? 'available' : interactive ? 'error' : 'idle',
      availableVersion: keepAvailable ? previousState.availableVersion : null,
      error: interactive ? message : null,
      lastCheckedAt: Date.now(),
    })
  }
  return getUpdateState()
}
```

**Lifecycle registration pattern** (`packages/desktop/src/main/index.ts` lines 282-290, 303-310):

```typescript
app.whenReady().then(() => {
  configureApplicationMenu()
  configureSessionSecurity()
  registerIpcHandlers({ showMainWindow })
  startNotifyServer()
  startDbChangeWatcher()
  startReconcileLoop()
  startUpdateChecksSafely()
})

app.on('before-quit', () => {
  isQuitting = true
  setDbChangeListener(null)
  stopAutomaticUpdateChecks()
  destroyMenubarTray()
  stopNotifyServer()
  stopDbChangeWatcher()
  stopReconcileLoop()
})
```

**Copy guidance:** `usage-service.ts` should expose start/stop/manual refresh/query helpers. It should serialize overlapping scans/pricing refreshes like `runSerializedUpdateCheck`, perform DB writes in transactions, notify renderer with a new push event, and keep page queries pure.

---

### Typed IPC, Preload, And Route Allowlist

**Apply to:** `packages/desktop/src/main/ipc-handlers.ts`, `packages/desktop/src/shared/ipc-types.ts`, `packages/desktop/src/preload/index.ts`, `packages/desktop/src/main/window-security.ts`

**Analogs:** same files

**IPC arg validation + result pattern** (`packages/desktop/src/main/ipc-handlers.ts` lines 101-131):

```typescript
function assertValidHistoryArgs(args: unknown): asserts args is { periodDays: HistoryPeriodDays } {
  const periodDays = (args as { periodDays?: unknown } | undefined)?.periodDays
  if (typeof periodDays !== 'number' || !VALID_HISTORY_PERIODS.has(periodDays)) {
    throw new Error('Invalid history period')
  }
}

ipcMain.handle(
  'getHistorySummary',
  async (_event, args): Promise<IpcResult<ReturnType<typeof queryHistorySummary>>> => {
    try {
      assertValidHistoryArgs(args)
      return { ok: true, data: queryHistorySummary(args) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  },
)
```

**Preferences merge/update pattern** (`packages/desktop/src/main/ipc-handlers.ts` lines 193-225):

```typescript
ipcMain.handle(
  'updateAppPreferences',
  async (_event, preferences: unknown): Promise<IpcResult<AppPreferences>> => {
    try {
      if (!isPlainObject(preferences)) {
        return { ok: false, error: 'Invalid preferences payload' }
      }
      const prefs = preferences as Partial<AppPreferences>
      const current = readConfig()
      const next = mergeConfig(current, {
        app: {
          language: normalizeAppLanguage(prefs.language, current.app.language),
          open_at_login: openAtLogin,
          theme: normalizeAppTheme(prefs.theme, current.app.theme),
          last_view:
            prefs.lastView === undefined
              ? current.app.last_view
              : normalizeAppRoute(prefs.lastView),
        },
      })
      writeConfig(next)
      return { ok: true, data: appPreferencesFromConfig(next) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  },
)
```

**Shared IPC contract pattern** (`packages/desktop/src/shared/ipc-types.ts` lines 1-5, 152-183):

```typescript
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const APP_LANGUAGES = ['en', 'zh'] as const
export const APP_THEMES = ['system', 'light', 'dark'] as const
export const HISTORY_PERIODS = [7, 30, 90, 365] as const

export interface IpcMethods {
  getTodayLiveState: { args: undefined; result: TodayLiveState }
  getHistorySummary: { args: { periodDays: 7 | 30 | 90 | 365 }; result: HistorySummary }
  updateAppPreferences: { args: Partial<AppPreferences>; result: AppPreferences }
}

export type IpcChannel = keyof IpcMethods

export type IpcPushEvent = {
  type: 'db-changed' | 'update-state-changed'
  agent?: string
  event_type?: string
  session_id?: string
  project?: string
  ts?: number
}
```

**Preload allowlist pattern** (`packages/desktop/src/preload/index.ts` lines 4-24, 35-52):

```typescript
const IPC_CHANNELS = new Set<IpcChannel>([
  'getTodayLiveState',
  'getHistorySummary',
  'getMenubarState',
  'getAgentStatus',
])

const api = {
  platform: rendererPlatform(),
  invoke<T extends IpcChannel>(
    channel: T,
    ...args: IpcMethods[T]['args'] extends void ? [] : [IpcMethods[T]['args']]
  ): Promise<IpcResult<IpcMethods[T]['result']>> {
    if (!IPC_CHANNELS.has(channel)) {
      return Promise.resolve({ ok: false, error: 'Invalid IPC channel' })
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  onPush(callback: (event: IpcPushEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: IpcPushEvent) => callback(data)
    ipcRenderer.on('push', handler)
    return () => {
      ipcRenderer.removeListener('push', handler)
    }
  },
}
```

**Route allowlist pattern** (`packages/desktop/src/main/window-security.ts` lines 3-10):

```typescript
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const APP_ROUTES = new Set(['/', '/live', '/history', '/settings'])

export function normalizeAppRoute(route: unknown, fallback = '/'): string {
  if (typeof route !== 'string') return fallback
  const path = route.startsWith('/') ? route : `/${route}`
  return APP_ROUTES.has(path) ? path : fallback
}
```

**Copy guidance:** add `/usage` to `APP_ROUTES`, `LAST_VIEW_ROUTES`, sidebar nav, and preload channel allowlist together. Usage IPC args need their own validator using `HISTORY_PERIODS` plus usage filter allowlists.

---

### Renderer Store And Store Tests

**Apply to:** `packages/desktop/src/renderer/src/store.ts`, `packages/desktop/src/renderer/src/usage-store.test.ts`

**Analogs:** `packages/desktop/src/renderer/src/store.ts`, `packages/desktop/src/renderer/src/store.test.ts`

**Atom/cache/sequence pattern** (`packages/desktop/src/renderer/src/store.ts` lines 15-35, 95-112):

```typescript
export const store = createStore()

type HistorySummaryCache = Partial<Record<HistoryPeriodDays, HistorySummary>>

export const todayLiveStateAtom = atom<TodayLiveState | null>(null)
export const historySummariesAtom = atom<HistorySummaryCache>({})

let refreshSeq = 0
const historyRefreshSeqByPeriod = new Map<HistoryPeriodDays, number>()
let activeHistoryPeriod: HistorySummary['periodDays'] | null = null

export async function refreshHistorySummary(
  periodDays: HistorySummary['periodDays'],
): Promise<IpcResult<HistorySummary> | null> {
  activeHistoryPeriod = periodDays
  const seq = (historyRefreshSeqByPeriod.get(periodDays) ?? 0) + 1
  historyRefreshSeqByPeriod.set(periodDays, seq)
  try {
    const result = await window.api.invoke('getHistorySummary', { periodDays })
    if (seq !== historyRefreshSeqByPeriod.get(periodDays)) return null
    if (result.ok) {
      setHistorySummary(result.data)
    }
    return result
  } catch {
    return null
  }
}
```

**Push handling pattern** (`packages/desktop/src/renderer/src/store.ts` lines 202-216):

```typescript
export function handlePush(event: IpcPushEvent): void {
  if (event.type === 'db-changed') {
    void refreshTodayLiveState()
    void refreshMenubarState()
    // Incremental history refresh only after the History view has loaded once.
    // This avoids extra IPC work for users who never open History.
    if (activeHistoryPeriod !== null && Object.keys(store.get(historySummariesAtom)).length > 0) {
      void refreshHistorySummary(activeHistoryPeriod)
    }
    return
  }
  if (event.type === 'update-state-changed') {
    void refreshUpdateState()
  }
}
```

**Store test stale refresh pattern** (`packages/desktop/src/renderer/src/store.test.ts` lines 18-28, 115-149):

```typescript
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

it('ignores stale refreshes when a newer db change arrives first', async () => {
  const requests: Array<{ channel: string; deferred: ReturnType<typeof deferred> }> = []
  const invoke = vi.fn((channel: string) => {
    const request = { channel, deferred: deferred<unknown>() }
    requests.push(request)
    return request.deferred.promise
  })
  vi.stubGlobal('window', { api: { invoke } })

  handlePush({ type: 'db-changed' })
  handlePush({ type: 'db-changed' })

  requests[3].deferred.resolve({ ok: true, data: { todayTotal: 42 } })
  requests[2].deferred.resolve({ ok: true, data: makeLiveState(2, 42) })
  await flushPromises()

  requests[0].deferred.resolve({ ok: true, data: makeLiveState(1, 1) })
  requests[1].deferred.resolve({ ok: true, data: { todayTotal: 1 } })
  await flushPromises()

  expect(store.get(todayLiveStateAtom)?.completed.grandTotal).toBe(42)
})
```

**Copy guidance:** create `usageSummariesAtom`, `usageRefreshSeqByPeriod`, `activeUsagePeriod`, `refreshUsageSummary`, and `runUsageRefresh`. Usage push refresh should be best-effort and only run after Usage has loaded once.

---

### Renderer Route, Sidebar, Usage View, And Charts

**Apply to:** `packages/desktop/src/renderer/src/App.tsx`, `packages/desktop/src/renderer/src/components/Sidebar.tsx`, `packages/desktop/src/renderer/src/views/Usage.tsx`

**Analogs:** `App.tsx`, `Sidebar.tsx`, `History.tsx`, `charts/theme.ts`

**Route registration + last-view pattern** (`packages/desktop/src/renderer/src/App.tsx` lines 17-23, 29-32, 68-73):

```tsx
const isMac = window.api.platform === 'darwin'
const LAST_VIEW_ROUTES = new Set(['/', '/live', '/history', '/settings'])
const History = lazy(() => import('./views/History'))

useEffect(() => {
  if (!LAST_VIEW_ROUTES.has(location.pathname)) return
  void window.api.invoke('updateAppPreferences', { lastView: location.pathname })
}, [location.pathname])

<Routes>
  <Route path="/" element={<Today />} />
  <Route path="/live" element={<Live />} />
  <Route path="/history" element={<History />} />
  <Route path="/settings" element={<Settings />} />
</Routes>
```

**Sidebar nav pattern** (`packages/desktop/src/renderer/src/components/Sidebar.tsx` lines 15-20, 51-66):

```tsx
const navItems = [
  { to: '/', labelKey: 'nav.today', icon: BarChart3Icon },
  { to: '/live', labelKey: 'nav.live', icon: RadioIcon },
  { to: '/history', labelKey: 'nav.history', icon: CalendarDaysIcon },
  { to: '/settings', labelKey: 'nav.settings', icon: SettingsIcon },
] as const

{navItems.map(({ to, labelKey, icon: Icon }) => (
  <NavLink key={to} to={to} className={({ isActive }) => cn(buttonVariants({ variant: 'ghost', size: 'lg' }), isActive && 'bg-accent text-foreground')}>
    <Icon aria-hidden="true" className="size-[18px]" />
    <span className="leading-none">{t(labelKey)}</span>
  </NavLink>
))}
```

**Dashboard panel pattern** (`packages/desktop/src/renderer/src/views/History.tsx` lines 42-66):

```tsx
function DashboardPanel({ title, description, children, className }: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col pt-1', className)}>
      <header className="mb-2.5 px-1">
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">{description}</p>
        )}
      </header>
      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-sm shadow-black/[0.01]">
        <div className="flex h-full flex-col px-5 pt-4 pb-5">{children}</div>
      </div>
    </section>
  )
}
```

**ECharts hook pattern** (`packages/desktop/src/renderer/src/views/History.tsx` lines 243-271):

```tsx
function useChart(
  ref: React.RefObject<HTMLDivElement | null>,
  options: EChartsCoreOption | null,
  themeName: string,
) {
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, themeName)
    chartRef.current = chart
    if (optionsRef.current) chart.setOption(optionsRef.current, true)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chartRef.current = null
      chart.dispose()
    }
  }, [ref, themeName])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !options) return
    chart.setOption(options, true)
  }, [options])
}
```

**Chart tokens pattern** (`packages/desktop/src/renderer/src/charts/theme.ts` lines 68-122):

```typescript
const chartTokens = {
  light: {
    axisLabel: '#737373',
    seriesPalette: ['#2563eb', '#10b981', '#f59e0b', '#e11d48', '#7c3aed', '#737373'],
    tooltipBg: '#ffffff',
    tooltipMuted: '#737373',
  },
  dark: {
    axisLabel: '#a3a3a3',
    seriesPalette: ['#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#a3a3a3'],
    tooltipBg: '#171717',
    tooltipMuted: '#a3a3a3',
  },
} as const

export function getChartThemeName(colorScheme: ResolvedColorScheme) {
  return chartThemeNames[colorScheme]
}

export function getChartTokens(colorScheme: ResolvedColorScheme) {
  return chartTokens[colorScheme]
}
```

**Header/period tabs pattern** (`packages/desktop/src/renderer/src/views/History.tsx` lines 1127-1158):

```tsx
<PageShell className="flex flex-col gap-5 py-7 sm:px-7 sm:py-8" fluid>
  <header className="flex items-center justify-between gap-4">
    <div>
      <p className="text-[13px] text-muted-foreground">{t('history.retrospective')}</p>
      <h1 className="font-heading text-2xl font-semibold">{t('history.title')}</h1>
    </div>
    <div className="flex items-center gap-2">
      <Spinner aria-hidden={!isLoadingPeriod} className={cn('h-3.5 w-3.5 text-muted-foreground transition-opacity', isLoadingPeriod ? 'opacity-100' : 'opacity-0')} />
      <Tabs value={periodDays.toString()} onValueChange={(v) => setPeriodDays(Number(v) as (typeof PERIODS)[number])}>
        <TabsList>
          {PERIODS.map((period) => (
            <TabsTab key={period} value={period.toString()} className="h-6 px-2.5 font-heading text-[11.5px] tracking-tight tabular-nums">
              {formatPeriodLabel(period, locale)}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>
    </div>
  </header>
</PageShell>
```

**Sortable table pattern** (`packages/desktop/src/renderer/src/views/History.tsx` lines 1389-1442):

```tsx
<DashboardPanel title={t('history.topProjects')}>
  <Table className="text-[13px]">
    <TableHeader className="[&_tr]:border-border/35">
      <TableRow className="border-border/35">
        {(['project', 'total', 'turns', 'lastActive', 'focusTurns', 'median'] as const).map((key) => (
          <TableHead className="h-8 px-3 text-[11px]" key={key}>
            <button className="inline-flex items-center" onClick={() => changeSort(key)} type="button">
              {key === 'project' ? t('history.project') : t('history.total')}
              <SortIcon active={sortKey === key} asc={sortAsc} />
            </button>
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
    <TableBody>
      {sortedRows.map((row) => (
        <TableRow className="border-border/25" key={row.project}>
          <TableCell className="px-3 py-3">{row.project}</TableCell>
          <TableCell className="px-3 py-3 font-heading tracking-tight tabular-nums">
            {formatDurationSummary(row.total, locale)}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</DashboardPanel>
```

**Copy guidance:** `Usage.tsx` should copy History's `PageShell`, `DashboardPanel`, `useChart`, tabs, spinner opacity, chart token, and table sort patterns. Add the `Refresh Usage` button and coss `Select` filters per UI-SPEC. Do not nest Usage under History.

---

### Settings, Config, And I18n

**Apply to:** `packages/desktop/src/renderer/src/views/Settings.tsx`, `packages/hook/src/config.ts`, `packages/hook/src/config.test.ts`, `packages/desktop/src/renderer/src/locales/en.json`, `packages/desktop/src/renderer/src/locales/zh.json`

**Analogs:** `Settings.tsx`, `config.ts`, `i18n.ts`

**Settings section/row pattern** (`packages/desktop/src/renderer/src/views/Settings.tsx` lines 52-80):

```tsx
function SettingsSection({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">{description}</p>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-border/55 bg-card shadow-sm shadow-black/[0.02]">
        <div className="flex flex-col divide-y divide-border/40">{children}</div>
      </div>
    </section>
  )
}

function SettingsRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 p-4', className)}>{children}</div>
  )
}
```

**coss Select pattern** (`packages/desktop/src/renderer/src/views/Settings.tsx` lines 82-147):

```tsx
const themeLabelId = useId()
const themeItems = THEME_OPTIONS.map((item) => ({
  label: t(item.labelKey),
  value: item.value,
}))

<Select
  aria-labelledby={themeLabelId}
  disabled={!preferences || saving}
  items={themeItems}
  onValueChange={(value) => {
    if (value) void updatePreferences({ theme: value as AppTheme })
  }}
  value={theme}
>
  <SelectTrigger className="w-40 shrink-0">
    <SelectValue />
  </SelectTrigger>
  <SelectPopup>
    {themeItems.map((item) => (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    ))}
  </SelectPopup>
</Select>
```

**Config schema/default/serializer pattern** (`packages/hook/src/config.ts` lines 14-38, 56-84, 100-115):

```typescript
export interface VibetimeConfig {
  projects: Record<string, string>
  display: {
    timezone: string
  }
  app: {
    language: 'en' | 'zh'
    open_at_login: boolean
    theme: 'system' | 'light' | 'dark'
    last_view: string
  }
}

const DEFAULT_CONFIG: VibetimeConfig = {
  projects: {},
  display: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  app: {
    language: 'en',
    open_at_login: false,
    theme: 'system',
    last_view: '/',
  },
}

export function readConfig(): VibetimeConfig {
  ensureVibetimeDir()
  if (!existsSync(getConfigPath())) {
    writeConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }
  try {
    const raw = readFileSync(getConfigPath(), 'utf-8')
    const config = parseToml(raw)
    return {
      projects: config.projects ?? {},
      display: { timezone: readString(config.display?.timezone, DEFAULT_CONFIG.display.timezone) },
      app: {
        language: readEnum(config.app?.language, ['en', 'zh'], DEFAULT_CONFIG.app.language),
        open_at_login: readBoolean(config.app?.open_at_login, DEFAULT_CONFIG.app.open_at_login),
        theme: readEnum(config.app?.theme, ['system', 'light', 'dark'], DEFAULT_CONFIG.app.theme),
        last_view: readString(config.app?.last_view, DEFAULT_CONFIG.app.last_view),
      },
    }
  } catch (err) {
    appendLog(`readConfig fell back to defaults: ${err}`)
    return DEFAULT_CONFIG
  }
}

function serializeToml(config: VibetimeConfig): string {
  const lines: string[] = []
  lines.push('[app]')
  lines.push(`language = "${config.app.language}"`)
  lines.push(`open_at_login = ${config.app.open_at_login}`)
  lines.push(`theme = "${config.app.theme}"`)
  lines.push(`last_view = "${escapeTomlString(config.app.last_view)}"`)
  return `${lines.join('\n')}\n`
}
```

**i18n typed key pattern** (`packages/desktop/src/renderer/src/i18n.ts` lines 1-12, 29-38):

```typescript
import en from './locales/en.json'
import zh from './locales/zh.json'

export type TranslationKey = keyof typeof en

export const APP_LOCALES: Record<AppLanguage, string> = {
  en: 'en-US',
  zh: 'zh-CN',
}

export function useI18n() {
  const { i18n: instance, t } = useTranslation()
  const language = normalizeAppLanguage(instance.resolvedLanguage ?? instance.language)
  return {
    language,
    locale: APP_LOCALES[language],
    t: (key: TranslationKey) => t(key),
  }
}
```

**Copy guidance:** add `usage_refresh_frequency` or equivalent validated enum to `config.ts`, shared `VibetimeConfig`, IPC merge logic, Settings UI, and both locale files in one plan. Use coss `Select`, not a custom dropdown.

---

### Usage Mapping Artifact

**Apply to:** `.planning/phases/07-usage-analytics/07-USAGE-MAPPING.md`

**Analog:** no direct codebase analog.

**Required structure from spec/context:** include one row per product question:

```markdown
| Data Capability | Hook Linkage | User Value | Visualization | Supported In MVP? |
|---|---|---|---|---|
| transcript timestamp + token breakdown | optional session/turn match | daily token trend | daily usage trend | yes |
| model + output tokens + duration | requires hook turn duration | model efficiency | table first | conditional |
```

**Copy guidance:** create this artifact after scanner fields are proven and before final chart implementation. It must distinguish transcript-only, hook-linked, and unsupported insights. It is a phase artifact, not runtime code.

## Shared Patterns

### Renderer Boundary

**Source:** `packages/desktop/src/preload/index.ts` and `packages/desktop/src/shared/ipc-types.ts`  
**Apply to:** Usage page, Usage store, Settings row, all renderer calls

Renderer must call typed IPC only. No renderer SQLite, filesystem, transcript scanning, or pricing fetch.

```typescript
invoke<T extends IpcChannel>(
  channel: T,
  ...args: IpcMethods[T]['args'] extends void ? [] : [IpcMethods[T]['args']]
): Promise<IpcResult<IpcMethods[T]['result']>> {
  if (!IPC_CHANNELS.has(channel)) {
    return Promise.resolve({ ok: false, error: 'Invalid IPC channel' })
  }
  return ipcRenderer.invoke(channel, ...args)
}
```

### Background Work Stays Out Of Read Paths

**Source:** `packages/desktop/src/main/db.ts` lines 124-141 and 337-349  
**Apply to:** `usage-service.ts`, `queryUsageSummary`, Usage page open

Background usage scan can do file I/O and writes; summary reads should be DB/cache reads only.

### Error Handling

**Source:** `packages/desktop/src/main/ipc-handlers.ts` lines 111-131 and `packages/desktop/src/main/updater.ts` lines 244-257  
**Apply to:** IPC handlers, pricing refresh, usage scan refresh

Use `IpcResult<T>` for renderer-facing failures. Keep stale/cache state visible when refresh fails.

### Privacy

**Source:** `packages/desktop/src/main/db.ts` lines 184-190 and Phase 07 SPEC  
**Apply to:** scanners, usage DB writes, scan state, tests

Store source identity, basename/hash/root-relative keys, token counts, model, timestamp, and attribution. Do not store raw transcript lines, prompt text, response text, tool arguments, or full paths when a basename/hash is enough.

```typescript
meta: JSON.stringify({
  reason: 'codex_task_complete_fallback',
  transcript_file: basename(transcriptPath),
}),
```

### Usage Agent Whitelist

**Source:** Phase 07 SPEC plus current all-agent status list in `packages/desktop/src/main/db.ts` lines 473-546  
**Apply to:** scanner registry, aggregations, filters, legends, tests

Usage analytics must use only `claude-code` and `codex`. Do not copy all-agent arrays from Settings/agent status into usage totals.

### coss UI Controls

**Source:** `.agents/skills/coss/SKILL.md` and `Settings.tsx` select/switch patterns  
**Apply to:** Usage filters, Settings refresh frequency

Use installed local coss components only: `button`, `input`, `select`, `separator`, `spinner`, `switch`, `table`, `tabs`. Verify new coss primitives before adding them.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/core/src/usage/__fixtures__/codex-token-count.jsonl` | test fixture | file-I/O | No JSONL fixture files exist yet; current parser tests inline JSONL strings. |
| `packages/core/src/usage/__fixtures__/codex-duplicate-session.jsonl` | test fixture | file-I/O | No backfill fixture analog exists. |
| `packages/core/src/usage/__fixtures__/claude-assistant-usage.jsonl` | test fixture | file-I/O | No Claude transcript fixture analog exists. |
| `packages/core/src/usage/__fixtures__/claude-privacy-canary.jsonl` | test fixture | file-I/O | No privacy canary fixture analog exists. |
| `packages/core/src/usage/__fixtures__/pricing-cache.json` | test fixture | transform | No pricing cache fixture exists. |
| `.planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` | documentation artifact | transform | New phase-specific product/data mapping artifact; use SPEC/UI-SPEC structure. |

## Metadata

**Analog search scope:** `packages/core/src`, `packages/desktop/src`, `packages/hook/src`, `.planning/phases`  
**Files scanned:** 120+ project and planning files via `rg --files` / `rg`  
**Project instructions:** root `AGENTS.md` absent; user-provided instructions applied. `.agents/skills/coss` and `.agents/skills/coss-particles` read.  
**Pattern extraction date:** 2026-05-15
