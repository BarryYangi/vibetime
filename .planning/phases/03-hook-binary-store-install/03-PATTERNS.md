# Phase 3: Hook Binary, Store & Install - Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 15 (10 source + 5 test)
**Analogs found:** 10 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/hook/src/index.ts` | entry-point | routing | `packages/core/src/adapters/index.ts` (barrel) + `packages/core/src/project.ts` (basename) | role-match |
| `packages/hook/src/hook.ts` | controller | request-response | `packages/core/src/adapters/claude-code.ts` | role-match |
| `packages/hook/src/store.ts` | service | CRUD | `packages/core/src/schema.ts` (DDL constants) | partial |
| `packages/hook/src/cli.ts` | controller | request-response | 无 | no-analog |
| `packages/hook/src/fs.ts` | utility | file-I/O | 无 | no-analog |
| `packages/hook/src/recovery.ts` | service | CRUD | 无 | no-analog |
| `packages/hook/src/install.ts` | service | file-I/O + transform | 无 | no-analog |
| `packages/hook/src/config.ts` | utility | file-I/O | 无 | no-analog |
| `packages/hook/src/log.ts` | utility | file-I/O | 无 | no-analog |
| `packages/hook/src/constants.ts` | config | transform | `packages/core/src/schema.ts` | exact |
| `packages/hook/tests/store.test.ts` | test | CRUD | `packages/core/src/schema.test.ts` | role-match |
| `packages/hook/tests/recovery.test.ts` | test | CRUD | `packages/core/src/adapters/claude-code.test.ts` | role-match |
| `packages/hook/tests/hook.test.ts` | test | request-response | `packages/core/src/adapters/claude-code.test.ts` | role-match |
| `packages/hook/tests/install.test.ts` | test | file-I/O | `packages/core/src/project.test.ts` | role-match |
| `packages/hook/tests/fs.test.ts` | test | file-I/O | `packages/core/src/project.test.ts` | role-match |

## Pattern Assignments

### `packages/hook/src/index.ts` (entry-point, routing)

**Analog:** `packages/core/src/adapters/index.ts` (barrel export) + `packages/core/src/project.ts` (basename logic)

**Import pattern** (参考 `packages/core/src/index.ts` lines 1-8):
```typescript
// Barrel-style re-export, .js extension per NodeNext
export { adaptClaudeCode, adaptCodex, adaptCursor } from './adapters/index.js'
export type { AdapterFn, Agent, EventType, NormalizedEvent } from './events.js'
```

**Basename 路由模式** (参考 `packages/core/src/project.ts` lines 83-87 — POSIX split):
```typescript
// POSIX split — no node:path import per DEC-006 (core purity)
// hook 包可用 node:path
const parts = cwd.split('/').filter((s) => s.length > 0)
const base = parts[parts.length - 1]
```

**Entry point 模式:**
```typescript
// packages/hook/src/index.ts — argv[0] basename 路由
import { basename } from 'node:path'

const self = basename(process.argv[1] ?? '')

if (self === 'vibetime-hook') {
  // HOOK 模式: stdin → adapter → SQLite
  await import('./hook.js')
} else {
  // CLI 模式: parse subcommands
  await import('./cli.js')
}
```

**关键约束:** 零依赖手写 argv 解析（CONTEXT.md 灰色区域 1）。不引入 commander/clipanion。

---

### `packages/hook/src/hook.ts` (controller, request-response)

**Analog:** `packages/core/src/adapters/claude-code.ts`

**核心模式 — try-catch-return-null (never throws)** (参考 `claude-code.ts` lines 49-107):
```typescript
export const adaptClaudeCode: AdapterFn = (rawPayload, eventName) => {
  try {
    const event_type = EVENT_TYPES[eventName]
    if (!event_type) return null
    if (!hasRequired(rawPayload)) return null
    // ... core logic ...
    return event
  } catch {
    return null  // Last line of defense for never-throws contract
  }
}
```

**Hook 模式应用:**
```typescript
// packages/hook/src/hook.ts — 整个 hook 执行包装在 try-catch 中
async function main(): Promise<void> {
  try {
    const raw = await Bun.stdin.text()
    const payload = JSON.parse(raw)
    // ... adapter dispatch → resolveProject → persist ...
  } catch (err) {
    appendLog(`Error: ${err}`)
  }
  process.exit(0) // Always exit 0 (PRD S7)
}
```

**类型守卫模式** (参考 `claude-code.ts` lines 23-30):
```typescript
function hasRequired(p: unknown): p is { session_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}
```

**Adapter dispatch 映射** (参考 `claude-code.ts` line 14-19 EVENT_TYPES 查找表):
```typescript
const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  UserPromptSubmit: 'turn_start',
  Stop: 'turn_end',
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
}
```

---

### `packages/hook/src/store.ts` (service, CRUD)

**Analog:** `packages/core/src/schema.ts`

**DDL 常量模式** (参考 `schema.ts` lines 13-44):
```typescript
export const DDL_EVENTS = `CREATE TABLE events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    ...
);` as const

export const DDL_INDICES = [
  'CREATE INDEX idx_events_ts ON events(ts);',
  ...
] as const
```

**Store 层 IF NOT EXISTS 包装** (RESEARCH.md Pattern 1):
```typescript
import { Database } from "bun:sqlite"
import { DDL_EVENTS, DDL_OPEN_TURNS, DDL_INDICES } from "@vibetime/core"

export function openDatabase(path: string = DB_PATH): Database {
  const db = new Database(path, { create: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA busy_timeout = 5000")
  db.run("PRAGMA foreign_keys = ON")

  // FND-03: core DDL 无 IF NOT EXISTS，store 层负责幂等
  db.run(DDL_EVENTS.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"))
  db.run(DDL_OPEN_TURNS.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"))
  for (const idx of DDL_INDICES) {
    db.run(idx.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS"))
  }
  return db
}
```

**Prepared statement 模式** (RESEARCH.md Code Examples — SQLite Event Persistence):
```typescript
export function persistEvent(db: Database, event: NormalizedEvent): void {
  const insertEvent = db.query(`
    INSERT INTO events (schema_version, agent, event_type, project, session_id, turn_id, ts, timezone, duration_sec, meta)
    VALUES (1, $agent, $event_type, $project, $session_id, $turn_id, $ts, $timezone, $duration_sec, $meta)
  `)
  insertEvent.run({ $agent: event.agent, ... })
}
```

---

### `packages/hook/src/cli.ts` (controller, request-response)

**Analog:** 无直接 analog

**参考模式:** `packages/core/src/project.ts` 的 first-match 链模式用于命令分发:
```typescript
// resolveProject first-match chain (project.ts lines 62-97)
export function resolveProject(input: ResolveProjectInput): string {
  try {
    // 1. alias — first match wins
    if (aliases && cwd && Object.hasOwn(aliases, cwd)) { ... }
    // 2. git remote
    const fromGit = parseGitRemoteUrl(gitRemoteUrl)
    if (fromGit) return fromGit
    // 3. cwd basename
    // 4. fallback
    return '_unknown'
  } catch { return '_unknown' }
}
```

**CLI 命令分发应用:**
```typescript
// 手写 argv 解析，first-match 命令分发
const command = process.argv[2]
switch (command) {
  case 'install': await import('./install.js').then(m => m.install(process.argv[3])); break
  case 'today': /* query today's stats */; break
  case 'version': console.log(VERSION); break
  default: printHelp(); break
}
```

---

### `packages/hook/src/fs.ts` (utility, file-I/O)

**Analog:** 无直接 analog

**参考模式:** RESEARCH.md Pattern 3 (Log Rotation) 中的 `mkdirSync` 用法:
```typescript
import { mkdirSync } from "node:fs"

// 创建 ~/.vibetime/ 目录，mode 0700
mkdirSync(`${process.env.HOME}/.vibetime`, { recursive: true, mode: 0o700 })
```

**文件系统初始化模式:**
```typescript
export function ensureVibetimeDir(): string {
  const dir = `${process.env.HOME}/.vibetime`
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}
```

---

### `packages/hook/src/recovery.ts` (service, CRUD)

**Analog:** 无直接 analog

**参考模式:** `packages/core/src/adapters/claude-code.ts` 的 try-catch-return-null 模式 + store.ts 的 prepared statement 模式:
```typescript
// Orphan sweep: session_start 时清理上次崩溃遗留的 open_turns
export function recoverOrphans(db: Database, sessionId: string): void {
  try {
    const orphans = db.query("SELECT * FROM open_turns WHERE session_id = ?").all(sessionId)
    for (const orphan of orphans) {
      // 创建 synthetic turn_end event (meta.abandoned=true)
      // 删除 orphan open_turns row
    }
  } catch {
    // Recovery 失败不应阻断 hook 主流程
  }
}

// Stale sweep: CLI/desktop 启动时清理超时 open_turns
export function sweepStale(db: Database, maxAgeSec: number): void {
  try {
    const cutoff = Date.now() / 1000 - maxAgeSec
    const stale = db.query("SELECT * FROM open_turns WHERE started_at < ?").all(cutoff)
    for (const s of stale) {
      // 创建 synthetic turn_end event
      // 删除 stale row
    }
  } catch { /* swallow */ }
}
```

---

### `packages/hook/src/install.ts` (service, file-I-O + transform)

**Analog:** 无直接 analog

**参考模式:** RESEARCH.md Code Examples — Install Command (Claude Code):
```typescript
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs"

export function installClaudeCode(): void {
  mkdirSync(`${process.env.HOME}/.claude`, { recursive: true })

  let settings: Record<string, unknown> = {}
  if (existsSync(CLAUDE_SETTINGS_PATH)) {
    settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"))
  }

  // Backup 原文件
  copyFileSync(CLAUDE_SETTINGS_PATH, `${CLAUDE_SETTINGS_PATH}.backup`)

  // 幂等合并: 按 command 字符串匹配，已存在则跳过
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>
  for (const event of events) {
    const arr = (hooks[event] ?? []) as Array<{ matcher?: string; hooks?: Array<{ type: string; command: string }> }>
    const existing = arr.find((g) => g.matcher === "*")
    if (existing) {
      const hasVibetime = existing.hooks?.some((h) => h.command.includes("vibetime-hook"))
      if (hasVibetime) continue // Idempotent — skip
      existing.hooks.push({ type: "command", command: HOOK_BINARY_PATH })
    } else {
      arr.push({ matcher: "*", hooks: [{ type: "command", command: HOOK_BINARY_PATH }] })
    }
    hooks[event] = arr
  }

  settings.hooks = hooks
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
}
```

**通用 install 原则** (CONTEXT.md 灰色区域 3):
- 幂等: 多次运行结果一致，按 `command` 字符串匹配
- 备份: 写入前备份原文件为 `.backup`
- 保留: 不删除用户已有的其他 hooks
- 绝对路径: hook 路径必须是 absolute

---

### `packages/hook/src/config.ts` (utility, file-I/O)

**Analog:** 无直接 analog

**参考模式:** RESEARCH.md 提到 Bun 原生 TOML 加载器:
```typescript
// Bun 原生 TOML import (无需 npm 包)
import config from "./config.toml" with { type: "toml" }
```

**Config 读写模式:**
```typescript
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const CONFIG_PATH = `${process.env.HOME}/.vibetime/config.toml`

export function readConfig(): VibetimeConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG
  const raw = readFileSync(CONFIG_PATH, "utf-8")
  // TOML 解析 (Bun 原生或手写简单解析器)
  return parseToml(raw)
}

export function writeConfig(config: VibetimeConfig): void {
  writeFileSync(CONFIG_PATH, serializeToml(config))
}
```

---

### `packages/hook/src/log.ts` (utility, file-I/O)

**Analog:** 无直接 analog

**参考模式:** RESEARCH.md Pattern 3 — Log Rotation:
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

---

### `packages/hook/src/constants.ts` (config, transform)

**Analog:** `packages/core/src/schema.ts`

**常量定义模式** (参考 `schema.ts` lines 13, 39-44):
```typescript
export const SCHEMA_VERSION = 1 as const

export const DDL_INDICES = [
  'CREATE INDEX idx_events_ts ON events(ts);',
  ...
] as const
```

**Constants 应用:**
```typescript
export const VERSION = /* BUILD_VERSION via --define */ '0.0.0-dev'
export const DB_PATH = `${process.env.HOME}/.vibetime/data.db`
export const LOG_PATH = `${process.env.HOME}/.vibetime/hook.log`
export const CONFIG_PATH = `${process.env.HOME}/.vibetime/config.toml`
export const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
export const STALE_TURN_MAX_AGE = 6 * 60 * 60 // 6 hours (REC-02)
```

---

### Test Files Pattern

**Analog:** `packages/core/src/adapters/claude-code.test.ts` + `packages/core/src/project.test.ts`

**测试结构模式** (参考 `claude-code.test.ts`):
```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

describe('功能名 — happy paths', () => {
  it('预期行为描述', () => {
    const result = someFunction(input)
    expect(result).not.toBeNull()
    expect(result?.field).toBe('expected')
  })
})

describe('功能名 — adversarial inputs', () => {
  it('returns null on empty input', () => {
    expect(someFunction('')).toBeNull()
  })

  it('never throws on garbage input', () => {
    expect(() => someFunction(null)).not.toThrow()
    // @ts-expect-error -- runtime defensive
    expect(() => someFunction({})).not.toThrow()
  })
})
```

**Property-based 测试模式** (参考 `project.test.ts` lines 96-110):
```typescript
it('returns a non-empty string for every legitimate input (property: total function)', () => {
  const inputs = [/* 多种输入组合 */]
  for (const i of inputs) {
    const result = resolveProject(i)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  }
})
```

**Fake timers 模式** (参考 `claude-code.test.ts` lines 136-142):
```typescript
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-28T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})
```

**注意:** hook 包用 `bun test`（CONTEXT.md 灰色区域 2），但 `describe`/`it`/`expect` API 与 vitest 一致。import 来源改为 bun 内置:
```typescript
// bun test — import from bun:test (与 vitest API 几乎一致)
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
```

---

## Shared Patterns

### Never-Throws Contract (纯函数 + try-catch-return-null)

**Source:** `packages/core/src/adapters/claude-code.ts` lines 49-107
**Apply to:** `hook.ts`, `recovery.ts`, `store.ts` (所有 hook 层代码)

```typescript
export const adaptClaudeCode: AdapterFn = (rawPayload, eventName) => {
  try {
    // ... core logic with explicit type guards ...
    return event
  } catch {
    // Last line of defense for never-throws contract (DEC-011)
    return null
  }
}
```

**原则:** hook 层所有函数必须 catch 一切异常，绝不抛出。错误写入 `hook.log`，进程 exit 0。

### Type Guard 模式

**Source:** `packages/core/src/adapters/claude-code.ts` lines 23-30, `cursor.ts` lines 18-35
**Apply to:** `hook.ts` (stdin payload 校验), `install.ts` (config 结构校验)

```typescript
function hasRequired(p: unknown): p is { session_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}
```

### First-Match Chain 模式

**Source:** `packages/core/src/project.ts` lines 62-97
**Apply to:** `cli.ts` (命令分发), `hook.ts` (agent 检测)

```typescript
export function resolveProject(input: ResolveProjectInput): string {
  try {
    // 1. alias — first match wins
    // 2. git remote
    // 3. cwd basename
    // 4. fallback '_unknown'
  } catch { return '_unknown' }
}
```

### Prepared Statement + Parameter Binding

**Source:** RESEARCH.md Code Examples
**Apply to:** `store.ts` (所有 SQLite 写入)

```typescript
const insertEvent = db.query(`
  INSERT INTO events (...) VALUES (...)
`)
insertEvent.run({ $agent: event.agent, ... })
```

**原则:** 永远用参数绑定，不用字符串拼接（防 SQLite 注入）。

### Error Logging (silent hook)

**Source:** RESEARCH.md Pattern 3
**Apply to:** 所有 hook 层文件

```typescript
try {
  // ... core logic ...
} catch (err) {
  appendLog(`Error: ${err}`)
}
process.exit(0) // Always exit 0
```

### File Backup Before Write

**Source:** RESEARCH.md Install Command
**Apply to:** `install.ts` (所有 agent config 修改)

```typescript
copyFileSync(originalPath, `${originalPath}.backup`)
// ... modify and write ...
```

### DDL IF NOT EXISTS 包装

**Source:** `packages/core/src/schema.ts` (FND-03 invariant) + RESEARCH.md Pattern 1
**Apply to:** `store.ts`

```typescript
// core DDL 无 IF NOT EXISTS (FND-03)，store 层负责幂等
db.run(DDL_EVENTS.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"))
```

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/hook/src/cli.ts` | controller | request-response | 无现有 CLI 命令分发代码，需手写 argv 解析 |
| `packages/hook/src/fs.ts` | utility | file-I/O | 无现有目录初始化代码 |
| `packages/hook/src/recovery.ts` | service | CRUD | 无现有崩溃恢复逻辑，需基于 store.ts 的 prepared statement 构建 |
| `packages/hook/src/install.ts` | service | file-I-O + transform | 无现有 agent config 合并代码，需手写三种 agent 的幂等合并 |
| `packages/hook/src/config.ts` | utility | file-I/O | 无现有 TOML 配置读写代码 |

## Metadata

**Analog search scope:** `packages/core/src/`, `packages/hook/src/`, `packages/desktop/`
**Files scanned:** 20
**Pattern extraction date:** 2026-04-29
