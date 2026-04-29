# Phase 3: Hook Binary, Store & Install - Research

**Researched:** 2026-04-29
**Domain:** Bun SQLite, binary compilation, agent hook integration, filesystem layout
**Confidence:** HIGH

## Summary

Phase 3 closes the data-capture loop: a Bun-compiled `vibetime-hook` binary reads agent stdin payloads, invokes the matching `core` adapter, resolves the project name, and persists `NormalizedEvent` rows to `~/.vibetime/data.db` via `bun:sqlite`. The phase also implements crash recovery (orphan sweep on session_start, stale sweep on CLI/desktop launch), filesystem initialization (`~/.vibetime/` at mode 0700 with `config.toml`), log rotation (~10MB cap), and idempotent `vibetime install <agent>` commands for Claude Code, Codex, and Cursor.

**Primary recommendation:** Use `bun:sqlite` with WAL mode + `synchronous=NORMAL` + `busy_timeout=5000` for all DB access. Compile the hook entry point via `bun build --compile --minify --bytecode` targeting `bun-darwin-arm64`. Embed version via `--define BUILD_VERSION='"..."'`. Hand-roll the CLI arg parser (no commander/clipanion). Use `node:fs` for directory creation and `Bun.spawnSync` for `git remote -v`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Agent hook invocation | Agent (Claude/Codex/Cursor) | -- | Agents fire hooks via stdin JSON |
| Payload parsing + adapter dispatch | Hook binary (CLI/Backend) | -- | Hook reads stdin, parses JSON, calls adapter |
| Project resolution | Hook binary (CLI/Backend) | core (pure logic) | Hook fetches git remote, core resolves name |
| SQLite persistence | Hook binary (CLI/Backend) | -- | Hook owns the `bun:sqlite` connection |
| Crash recovery | Hook binary + CLI/Backend | -- | Hook handles session_start sweep; CLI/desktop handles stale sweep |
| Filesystem init | Hook binary + CLI/Backend | -- | First-run `~/.vibetime/` creation |
| Install commands | CLI (Backend) | -- | `vibetime install <agent>` modifies agent config files |
| Log rotation | Hook binary (CLI/Backend) | -- | Error logging to `~/.vibetime/hook.log` |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:sqlite` | Bun 1.3.8 built-in | SQLite database access | Zero-dependency, 3-6x faster than better-sqlite3, synchronous API perfect for hook |
| `bun:fs` / `node:fs` | Bun built-in | Directory creation, file I/O | Fast, native, no external deps |
| `bun:child_process` | Bun built-in | `git remote -v` execution | Fast spawn, synchronous option available |
| `@vibetime/core` | workspace:* | Adapters, schema DDL, project resolution | Already implemented in Phase 1-2 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | -- | -- | Bun built-ins cover all requirements |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bun:sqlite` | `better-sqlite3` | better-sqlite3 is for Electron main process (DEC-005); bun:sqlite is faster for hook |
| Hand-roll CLI | `commander` / `clipanion` | CONTEXT.md explicitly bans CLI libraries; zero-dep constraint |
| TOML npm package | Bun built-in TOML import | Bun has native TOML loader; no package needed |

**Installation:**
```bash
# No new packages needed — all Bun built-ins
pnpm install  # (workspace resolution for @vibetime/core)
```

**Version verification:**
- Bun: 1.3.8 (verified on machine)
- Node: v22.7.0 (for vitest in core package)

## Architecture Patterns

### System Architecture Diagram

```
Agent (Claude Code / Codex / Cursor)
  │
  │ stdin JSON payload + eventName
  ▼
vibetime-hook binary (Bun-compiled)
  │
  ├─ 1. Read stdin → parse JSON
  ├─ 2. Detect agent from process.argv[1] basename or env
  ├─ 3. Call core adapter (adaptClaudeCode / adaptCodex / adaptCursor)
  ├─ 4. If NormalizedEvent returned:
  │     ├─ 4a. Read ~/.vibetime/config.toml (aliases)
  │     ├─ 4b. Run `git -C <cwd> config --get remote.origin.url`
  │     ├─ 4c. resolveProject({ cwd, aliases, gitRemoteUrl })
  │     ├─ 4d. Replace event.project with resolved name
  │     └─ 4e. Write to SQLite (events + open_turns)
  ├─ 5. Crash recovery (on session_start):
  │     ├─ 5a. Query open_turns for matching session_id
  │     ├─ 5b. Create synthetic turn_end events (meta.abandoned=true)
  │     └─ 5c. Delete orphan open_turns rows
  └─ 6. Exit 0 (always, even on error)
        Errors → ~/.vibetime/hook.log (rotated at ~10MB)
```

### Recommended Project Structure

```
packages/hook/
├── src/
│   ├── index.ts           # Entry point: argv detection → hook or CLI mode
│   ├── hook.ts            # Hook mode: stdin → adapter → SQLite write
│   ├── cli.ts             # CLI mode: parse subcommands (install, today, etc.)
│   ├── store.ts           # SQLite connection, PRAGMA setup, prepared statements
│   ├── recovery.ts        # Crash recovery logic (orphan sweep, stale sweep)
│   ├── install.ts         # install <agent> implementation
│   ├── config.ts          # ~/.vibetime/config.toml read/write
│   ├── log.ts             # hook.log with rotation
│   └── constants.ts       # VERSION, DB_PATH, LOG_PATH, etc.
├── tests/
│   ├── hook.test.ts       # Hook mode unit tests
│   ├── store.test.ts      # SQLite store tests
│   ├── recovery.test.ts   # Crash recovery tests
│   └── install.test.ts    # Install idempotency tests
├── package.json
├── tsconfig.json
└── vitest.config.ts       # bun test config
```

### Pattern 1: SQLite Store with PRAGMA Setup

**What:** Single `openDatabase()` function that creates/opens `data.db` with all required PRAGMAs and creates tables if they don't exist.

**When to use:** Every time the hook or CLI needs DB access.

**Example:**
```typescript
// Source: https://bun.sh/docs/api/sqlite
import { Database } from "bun:sqlite"
import { DDL_EVENTS, DDL_OPEN_TURNS, DDL_INDICES } from "@vibetime/core"

const DB_PATH = `${process.env.HOME}/.vibetime/data.db`

export function openDatabase(path: string = DB_PATH): Database {
  const db = new Database(path, { create: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA busy_timeout = 5000")
  db.run("PRAGMA foreign_keys = ON")

  // Create tables if not exist (idempotent)
  db.run(DDL_EVENTS.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"))
  db.run(DDL_OPEN_TURNS.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"))
  for (const idx of DDL_INDICES) {
    db.run(idx.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS"))
  }

  return db
}
```

**Note:** The DDL strings from `core` have NO `IF NOT EXISTS` (FND-03 invariant). The store layer wraps them with `IF NOT EXISTS` for idempotent table creation. This is the "idempotency deferred to Phase 3 store init layer" noted in STATE.md.

### Pattern 2: Hook Stdin Reading

**What:** Read entire stdin, parse as JSON, dispatch to adapter.

**When to use:** Every hook invocation.

**Example:**
```typescript
// Source: https://bun.sh/docs/api/file-io
async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk)
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(result)
}
```

**Alternative (simpler, synchronous):**
```typescript
// Bun.stdin is a BunFile, can use .text()
const raw = await Bun.stdin.text()
```

### Pattern 3: Log Rotation

**What:** Simple file-based log rotation checking size before each write.

**When to use:** Every error log write.

**Example:**
```typescript
import { statSync, renameSync, appendFileSync, mkdirSync } from "node:fs"

const LOG_PATH = `${process.env.HOME}/.vibetime/hook.log`
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export function appendLog(message: string): void {
  try {
    mkdirSync(`${process.env.HOME}/.vibetime`, { recursive: true, mode: 0o700 })
    try {
      const stat = statSync(LOG_PATH)
      if (stat.size > MAX_SIZE) {
        renameSync(LOG_PATH, `${LOG_PATH}.1`)
      }
    } catch {
      // File doesn't exist yet — fine
    }
    const line = `[${new Date().toISOString()}] ${message}\n`
    appendFileSync(LOG_PATH, line)
  } catch {
    // Last resort: swallow. Hook must never surface errors.
  }
}
```

### Anti-Patterns to Avoid

- **CLI libraries (commander/clipanion):** CONTEXT.md explicitly bans them. Hand-roll `process.argv` parsing.
- **Throwing from hook:** PRD S7 requires exit 0 always. Every code path must catch and log.
- **stdout/stderr output:** PRD S7 requires silence. All diagnostics go to `hook.log`.
- **Module-scope timestamps:** Adapter timestamps must be at call time, not module load time (RESEARCH SG.1).
- **Direct DDL from core without IF NOT EXISTS:** The core DDL strings intentionally omit existence guards. The store layer must wrap them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite access | Custom bindings | `bun:sqlite` | Built-in, 3-6x faster than better-sqlite3, zero deps |
| TOML parsing | Custom parser | Bun built-in `import ... with { type: "toml" }` | Native support, zero deps |
| Directory creation | Custom mkdir | `node:fs` `mkdirSync({ recursive: true, mode: 0o700 })` | Standard, handles edge cases |
| Git remote URL | Custom git command | `Bun.spawnSync(["git", "-C", cwd, "config", "--get", "remote.origin.url"])` | Fast, correct |
| Project resolution | Duplicate logic | `@vibetime/core` `resolveProject()` | Already implemented and tested |

## Common Pitfalls

### Pitfall 1: DDL IF NOT EXISTS Mismatch
**What goes wrong:** Using core DDL strings directly causes "table already exists" errors on second invocation.
**Why it happens:** Core DDL intentionally omits `IF NOT EXISTS` (FND-03 invariant). The store layer must add it.
**How to avoid:** Wrap DDL strings with `.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")` in the store init.
**Warning signs:** "table already exists" SQLite errors on second hook invocation.

### Pitfall 2: macOS WAL Persistence
**What goes wrong:** WAL and SHM files persist after database close on macOS.
**Why it happens:** macOS ships with Apple's SQLite build which has persistent WAL enabled by default.
**How to avoid:** This is expected behavior on macOS. Document it. The files are harmless and will be reused on next open.
**Warning signs:** Users reporting "extra files" alongside data.db.

### Pitfall 3: Agent Detection Ambiguity
**What goes wrong:** Hook can't determine which agent invoked it.
**Why it happens:** The agent passes the event name via stdin, but the hook needs to know which adapter to use.
**How to avoid:** Use `path.basename(process.argv[1])` to detect if running as `vibetime-hook` (hook mode) vs `vibetime` (CLI mode). For agent detection, parse the event name from stdin payload and match against known event names per agent. Alternatively, agents can pass `--source claude` as a command argument (Claude Code supports this per CONTEXT.md).
**Warning signs:** Wrong adapter being called, null returns on valid payloads.

### Pitfall 4: Concurrent SQLite Writes
**What goes wrong:** Two hook invocations from different agents corrupt the database.
**Why it happens:** Without WAL mode and busy_timeout, concurrent writes can fail or corrupt.
**How to avoid:** Always set `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000`. These handle concurrent writes correctly.
**Warning signs:** "database is locked" errors, corrupted rows.

### Pitfall 5: Exit Code Non-Zero
**What goes wrong:** Agent reports hook failure because hook exits with non-zero code.
**Why it happens:** Uncaught exception or explicit `process.exit(1)`.
**How to avoid:** Wrap entire hook execution in try/catch. Always `process.exit(0)`. Log errors to `hook.log`.
**Warning signs:** Agent shows error messages after hook invocation.

## Code Examples

### Complete Hook Entry Point

```typescript
// Source: https://bun.sh/docs/api/sqlite + https://bun.sh/docs/bundler/executables
import { adaptClaudeCode, adaptCodex, adaptCursor, resolveProject } from "@vibetime/core"
import type { Agent, NormalizedEvent } from "@vibetime/core"
import { openDatabase } from "./store"
import { appendLog } from "./log"
import { readConfig } from "./config"
import { recoverOrphans } from "./recovery"

async function main(): Promise<void> {
  try {
    // 1. Read stdin
    const raw = await Bun.stdin.text()
    const payload = JSON.parse(raw)

    // 2. Detect agent from argv or event name
    const agent = detectAgent()
    if (!agent) return process.exit(0)

    // 3. Call adapter
    const adapter = { "claude-code": adaptClaudeCode, codex: adaptCodex, cursor: adaptCursor }[agent]
    const event = adapter(payload, payload.hook_event_name || payload.event)

    if (!event) return process.exit(0)

    // 4. Resolve project
    const config = readConfig()
    const gitRemoteUrl = getGitRemoteUrl(event.project) // event.project is raw cwd
    event.project = resolveProject({
      cwd: event.project,
      aliases: config.projects,
      gitRemoteUrl,
    })

    // 5. Persist
    const db = openDatabase()
    persistEvent(db, event)

    // 6. Crash recovery on session_start
    if (event.event_type === "session_start") {
      recoverOrphans(db, event.session_id)
    }

    db.close()
  } catch (err) {
    appendLog(`Error: ${err}`)
  }
  process.exit(0) // Always exit 0
}

main()
```

### SQLite Event Persistence

```typescript
// Source: https://bun.sh/docs/api/sqlite
import { Database } from "bun:sqlite"
import type { NormalizedEvent } from "@vibetime/core"

export function persistEvent(db: Database, event: NormalizedEvent): void {
  const insertEvent = db.query(`
    INSERT INTO events (schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta)
    VALUES (1, $agent, $event_type, $project, $session_id, $turn_id, $ts, $timezone, $duration_sec, $meta)
  `)

  insertEvent.run({
    $agent: event.agent,
    $event_type: event.event_type,
    $project: event.project,
    $session_id: event.session_id,
    $turn_id: event.turn_id ?? null,
    $ts: event.ts,
    $timezone: event.timezone,
    $duration_sec: event.duration_sec ?? null,
    $meta: event.meta ? JSON.stringify(event.meta) : null,
  })

  // Track open turns for crash recovery
  if (event.event_type === "turn_start") {
    db.query(`
      INSERT OR REPLACE INTO open_turns (turn_id, agent, project, session_id, started_at, timezone, meta)
      VALUES ($turn_id, $agent, $project, $session_id, $ts, $timezone, $meta)
    `).run({
      $turn_id: event.turn_id!,
      $agent: event.agent,
      $project: event.project,
      $session_id: event.session_id,
      $ts: event.ts,
      $timezone: event.timezone,
      $meta: event.meta ? JSON.stringify(event.meta) : null,
    })
  } else if (event.event_type === "turn_end" && event.turn_id) {
    // Compute duration from open_turns
    const open = db.query("SELECT started_at FROM open_turns WHERE turn_id = ?").get(event.turn_id) as { started_at: number } | undefined
    if (open) {
      const duration = event.ts - open.started_at
      // Update the turn_end event with computed duration
      db.query("UPDATE events SET duration_sec = $dur WHERE turn_id = $turn_id AND event_type = 'turn_end'")
        .run({ $dur: duration, $turn_id: event.turn_id })
    }
    // Remove from open_turns
    db.query("DELETE FROM open_turns WHERE turn_id = ?").run(event.turn_id)
  }
}
```

### Install Command (Claude Code)

```typescript
// Source: CONTEXT.md install strategy
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const CLAUDE_SETTINGS_PATH = `${process.env.HOME}/.claude/settings.json`
const HOOK_BINARY_PATH = "/path/to/vibetime-hook" // resolved from process.execPath or import.meta.dir

export function installClaudeCode(): void {
  mkdirSync(`${process.env.HOME}/.claude`, { recursive: true })

  let settings: Record<string, unknown> = {}
  if (existsSync(CLAUDE_SETTINGS_PATH)) {
    settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"))
  }

  // Backup
  copyFileSync(CLAUDE_SETTINGS_PATH, `${CLAUDE_SETTINGS_PATH}.backup`)

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>
  const events = ["UserPromptSubmit", "Stop", "SessionStart", "SessionEnd"]

  for (const event of events) {
    const arr = (hooks[event] ?? []) as Array<{ matcher?: string; hooks?: Array<{ type: string; command: string }> }>
    const existing = arr.find((g) => g.matcher === "*")
    if (existing) {
      // Check if vibetime hook already exists
      const hasVibetime = existing.hooks?.some((h) => h.command.includes("vibetime-hook"))
      if (hasVibetime) continue // Idempotent — skip
      existing.hooks = existing.hooks ?? []
      existing.hooks.push({ type: "command", command: HOOK_BINARY_PATH })
    } else {
      arr.push({
        matcher: "*",
        hooks: [{ type: "command", command: HOOK_BINARY_PATH }],
      })
    }
    hooks[event] = arr
  }

  settings.hooks = hooks
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `better-sqlite3` for all SQLite | `bun:sqlite` for hook, `better-sqlite3` for Electron | DEC-005 | Hook gets 3-6x performance boost; Electron uses better-sqlite3 for native module compat |
| TOML npm package | Bun built-in TOML loader | Bun 1.x | Zero dependencies for config parsing |
| CLI library (commander) | Hand-roll process.argv | CONTEXT.md | Zero dependencies, simpler binary |

**Deprecated/outdated:**
- None identified. All approaches use current Bun 1.3.8 APIs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bun 1.3.8 `bun:sqlite` supports all required PRAGMAs (WAL, synchronous, busy_timeout, foreign_keys) | Standard Stack | Medium — would need better-sqlite3 workaround |
| A2 | `Bun.stdin.text()` reads entire stdin synchronously/async without timeout issues | Code Examples | Low — documented API |
| A3 | `bun build --compile --bytecode` produces binaries with <50ms cold start on macOS arm64 | Summary | Medium — if >50ms, need to remove --bytecode or optimize |
| A4 | Claude Code passes `--source claude` as a command argument to hooks | Pitfall 3 | Low — verified in CONTEXT.md research |
| A5 | Codex `hooks.json` format matches CONTEXT.md specification | Install Command | Low — verified in CONTEXT.md research |

## Open Questions (RESOLVED)

1. **Agent detection mechanism** RESOLVED
   - Decision: Install commands append `--source <agent>` (claude-code/codex/cursor) to hook binary path. `detectAgent()` checks `--source` first, falls back to event name matching.
   - Source: CONTEXT.md gray area 3 + Plan 04 Task 1 install commands

2. **Duration computation for turn_end** RESOLVED
   - Decision: Compute in hook at turn_end time. Read `started_at` from `open_turns`, compute `duration_sec = ts - started_at`, write to events row, then delete from open_turns.
   - Source: Plan 02 Task 1 store.ts + Plan 03 Task 2 hook.ts

3. **Stale sweep timing** RESOLVED
   - Decision: Hook does NOT do stale sweep (hot path). CLI subcommands (`vibetime today/export/install`) and desktop launch do stale sweep via `sweepStale()`.
   - Source: CONTEXT.md gray area 4 + Plan 03 Task 2 + Plan 04 Task 2

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Hook binary compilation | Yes | 1.3.8 | -- |
| bun:sqlite | SQLite persistence | Yes | Built-in | -- |
| node:fs | Directory/file operations | Yes | Built-in | -- |
| git | Remote URL resolution | Yes | System git | Use cwd basename as fallback |
| @vibetime/core | Adapters, schema, project resolution | Yes | workspace:* | -- |

**Missing dependencies with no fallback:**
- None identified. All required tools are available.

**Missing dependencies with fallback:**
- None identified.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun test` (Bun built-in) |
| Config file | `packages/hook/vitest.config.ts` (or bunfig.toml) |
| Quick run command | `cd packages/hook && bun test` |
| Full suite command | `pnpm run ci` (serial: core vitest + hook bun test) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STORE-01 | WAL mode + PRAGMAs applied | unit | `bun test store.test.ts` | No (Wave 0) |
| STORE-02 | Schema matches PRD S6 | unit | `bun test store.test.ts` | No (Wave 0) |
| STORE-03 | Concurrent writes no corruption | integration | `bun test store.test.ts` (multi-connection) | No (Wave 0) |
| REC-01 | Orphan sweep on session_start | unit | `bun test recovery.test.ts` | No (Wave 0) |
| REC-02 | Stale sweep at CLI launch | unit | `bun test recovery.test.ts` | No (Wave 0) |
| HOOK-01 | Cold start <50ms | benchmark | `hyperfine ./vibetime-hook` | No (Wave 0) |
| HOOK-02 | No stdout/stderr, exit 0 | integration | `bun test hook.test.ts` | No (Wave 0) |
| HOOK-03 | Errors logged to hook.log | unit | `bun test log.test.ts` | No (Wave 0) |
| HOOK-04 | Adapter + persist pipeline | integration | `bun test hook.test.ts` | No (Wave 0) |
| FS-01 | ~/.vibetime/ created at 0700 | unit | `bun test fs.test.ts` | No (Wave 0) |
| FS-02 | config.toml created with defaults | unit | `bun test config.test.ts` | No (Wave 0) |
| FS-03 | DB/log created lazily | unit | `bun test store.test.ts` | No (Wave 0) |
| CLI-01 | install idempotent | integration | `bun test install.test.ts` | No (Wave 0) |
| CLI-02 | Codex config.toml features flag | unit | `bun test install.test.ts` | No (Wave 0) |

### Sampling Rate

- **Per task commit:** `cd packages/hook && bun test`
- **Per wave merge:** `pnpm run ci`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps

- [ ] `packages/hook/tests/store.test.ts` — covers STORE-01, STORE-02, STORE-03, FS-03
- [ ] `packages/hook/tests/recovery.test.ts` — covers REC-01, REC-02
- [ ] `packages/hook/tests/hook.test.ts` — covers HOOK-01, HOOK-02, HOOK-04
- [ ] `packages/hook/tests/log.test.ts` — covers HOOK-03
- [ ] `packages/hook/tests/fs.test.ts` — covers FS-01
- [ ] `packages/hook/tests/config.test.ts` — covers FS-02
- [ ] `packages/hook/tests/install.test.ts` — covers CLI-01, CLI-02
- [ ] `packages/hook/vitest.config.ts` — bun test configuration
- [ ] `packages/hook/src/` — all source files (store, hook, cli, recovery, install, config, log, constants)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Local-only app, no auth |
| V3 Session Management | No | Agent sessions, not user sessions |
| V4 Access Control | No | Single-user local app |
| V5 Input Validation | Yes | Validate stdin JSON structure; reject malformed payloads silently |
| V6 Cryptography | No | No encryption needed (local-first, no network) |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed stdin payload | Denial of Service | JSON.parse in try/catch; exit 0 on failure |
| Path traversal in config.toml | Tampering | Validate paths are absolute; reject relative paths |
| SQLite injection | Tampering | Use prepared statements with parameter binding (bun:sqlite does this) |

## Sources

### Primary (HIGH confidence)
- [bun.sh/docs/api/sqlite](https://bun.sh/docs/api/sqlite) — bun:sqlite API, WAL mode, PRAGMAs, transactions, prepared statements
- [bun.sh/docs/bundler/executables](https://bun.sh/docs/bundler/executables) — bun build --compile, --define, --bytecode, cross-compilation
- [bun.sh/docs/runtime/loaders](https://bun.sh/docs/runtime/loaders) — Built-in TOML loader
- [bun.sh/docs/api/file-io](https://bun.sh/docs/api/file-io) — Bun.file, Bun.write, node:fs compat

### Secondary (MEDIUM confidence)
- CONTEXT.md — Install strategies for Claude Code, Codex, Cursor (verified by user)
- PRD S6, S7, S8, S9 — Schema, hook constraints, agent mappings, crash recovery

### Tertiary (LOW confidence)
- Bun cold start benchmarks (~5-10ms) — from Bun blog posts, not independently verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All APIs are Bun built-ins, well documented
- Architecture: HIGH — Follows existing core patterns, CONTEXT.md decisions
- Pitfalls: HIGH — Based on documented Bun/SQLite behavior

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days — Bun 1.3.8 is stable)
