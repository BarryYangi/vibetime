---
phase: 03-hook-binary-store-install
reviewed: 2026-04-29T12:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - packages/hook/src/constants.ts
  - packages/hook/src/fs.ts
  - packages/hook/src/config.ts
  - packages/hook/src/log.ts
  - packages/hook/src/constants.test.ts
  - packages/hook/src/fs.test.ts
  - packages/hook/src/config.test.ts
  - packages/hook/src/log.test.ts
  - packages/hook/package.json
  - packages/hook/src/index.ts
  - packages/hook/src/store.ts
  - packages/hook/src/store.test.ts
  - packages/core/src/events.ts
  - packages/hook/src/recovery.ts
  - packages/hook/src/recovery.test.ts
  - packages/hook/src/hook.ts
  - packages/hook/src/hook.test.ts
  - packages/hook/src/install.ts
  - packages/hook/src/install.test.ts
  - packages/hook/src/cli.ts
  - packages/hook/src/cli.test.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-29T12:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 3 实现了 hook 二进制、SQLite 存储层、crash recovery、agent hook 安装及 CLI 子命令。整体代码质量良好，测试覆盖充分，所有关键路径均有"永不抛出"的防御性编程。发现 4 个 Warning 和 5 个 Info 级别问题，无 Critical 级别缺陷。主要关注点：detectAgent 中 Codex 事件名匹配为死代码、TOML 解析器对引号值的处理存在边界问题、install.ts 中 config.toml 修改使用字符串替换而非结构化写入。

## Warnings

### WR-01: detectAgent 中 Codex 事件名匹配分支为死代码

**File:** `packages/hook/src/hook.ts:39-42`
**Issue:** Codex 的事件名匹配分支（`['UserPromptSubmit', 'Stop', 'SessionStart']`）永远不会被执行。因为 Claude Code 的匹配分支（line 35-37）先于 Codex 执行，且两者共享完全相同的事件名。Codex 只能通过 `--source codex` 参数被检测到。代码注释声称"Codex events (same names, no SessionEnd per adapter contract)"暗示这是有意设计，但死代码降低了可维护性。
**Fix:** 移除不可达的 Codex 事件名匹配分支，或将其合并到 Claude Code 分支中并添加注释说明 Codex 只能通过 `--source` 参数识别：
```typescript
// Claude Code and Codex share event names — Codex only detected via --source.
// See hook.test.ts line 69: "ambiguous events default to claude-code"
if (['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd'].includes(eventName)) {
  return 'claude-code'
}
// Codex events — same names as Claude Code, unreachable without --source.
// Intentionally omitted: Codex detection requires explicit --source flag.
```

### WR-02: TOML 解析器对引号值的正则处理存在边界问题

**File:** `packages/hook/src/config.ts:100`
**Issue:** `kvMatch` 正则 `^(\w+)\s*=\s*"?(.+?)"?$` 中，`"?` 为可选匹配。当值为带引号的字符串如 `timezone = "America/New_York"` 时，非贪婪的 `.+?` 会匹配到 `"America/New_York`（包含开头引号），然后 line 102 的 `.replace(/^"|"$/g, '')` 移除首尾引号。虽然对标准 TOML 输出正确工作，但对以下边界输入行为异常：
- `key = "value` （缺右引号）→ 正则匹配 `"value`，replace 移除开头引号 → 正确
- `key = value"` （缺左引号）→ 正则匹配 `value"`，replace 移除尾部引号 → 正确
- `key = "a"b"c"` → 正则匹配 `"a"b"c`，replace 移除首尾引号 → `a"b"c`，内部引号保留

**Fix:** 分别处理引号和非引号值：
```typescript
const kvMatch = trimmed.match(/^(\w+)\s*=\s*"(.+)"$|^(\w+)\s*=\s*(.+)$/)
if (kvMatch && currentSectionName) {
  const key = kvMatch[1] || kvMatch[3]
  const value = kvMatch[2] !== undefined ? kvMatch[2] : kvMatch[4]
  currentSection[key] = value
}
```

### WR-03: install.ts 中 config.toml 修改使用字符串替换而非结构化写入

**File:** `packages/hook/src/install.ts:104-117`
**Issue:** `installCodex()` 通过字符串包含检查（`configContent.includes('codex_hooks = true')`）和正则替换（`configContent.replace(/\[features\]/, ...)`）来修改 Codex config.toml。这种模式存在以下风险：
1. 如果 `[features]` 在注释中出现（如 `# [features]`），会被误匹配
2. 如果有多个 `[features]` 段落，只替换第一个
3. 如果 `codex_hooks = false` 已存在，`includes('codex_hooks = true')` 为 false 会追加第二行

当前的 vibetime config.toml 使用了结构化的 TOML 序列化器（`serializeToml`），但 Codex config.toml 使用了脆弱的字符串操作。

**Fix:** 对 Codex config.toml 也使用结构化读写，或至少用更精确的正则：
```typescript
// 更精确的匹配：只匹配行首的 [features]，非注释
configContent = configContent.replace(
  /^(?<!#\s*)\[features\]/m,
  '[features]\ncodex_hooks = true',
)
// 检查时也应更精确
if (!/^codex_hooks\s*=\s*true/m.test(configContent)) { ... }
```

### WR-04: store.ts 中 persistEvent 未使用事务包裹多步写入

**File:** `packages/hook/src/store.ts:53-102`
**Issue:** `persistEvent` 执行三步写入操作：INSERT events、INSERT OR REPLACE open_turns（或 UPDATE events + DELETE open_turns）。如果在中间步骤失败（如 UPDATE 后 DELETE 前崩溃），数据库会处于不一致状态。虽然 bun:sqlite 的 WAL 模式提供了一定保护，且 catch 块保证不抛出，但缺少显式事务意味着：
- `turn_start` 可能写入 events 但未写入 open_turns
- `turn_end` 的 duration_sec 可能已更新但 open_turns 未清理

**Fix:** 使用 `db.transaction()` 包裹写入操作：
```typescript
const insertAndManage = db.transaction((event: NormalizedEvent) => {
  insertEvent.run({ ... })
  if (event.event_type === 'turn_start' && event.turn_id) {
    // ... insert into open_turns
  } else if (event.event_type === 'turn_end' && event.turn_id) {
    // ... update duration and delete from open_turns
  }
})
insertAndManage(event)
```

## Info

### IN-01: constants.ts 中路径常量在模块加载时求值

**File:** `packages/hook/src/constants.ts:5-7`
**Issue:** `DB_PATH`、`LOG_PATH`、`CONFIG_PATH` 使用 `process.env.HOME` 在模块顶层求值。如果 HOME 未设置，路径会是 `undefined/.vibetime/...`。`config.ts` 和 `log.ts` 已使用 getter 函数（`getConfigPath()`、`getLogPath()`）规避此问题，但 `store.ts` 的 `openDatabase` 默认参数 `path = DB_PATH` 仍使用静态值。
**Fix:** 将常量改为 getter 函数以保持一致性，或在 `openDatabase` 中也使用 getter：
```typescript
export function getDbPath(): string {
  return `${process.env.HOME}/.vibetime/data.db`
}
```

### IN-02: log.ts 日志轮转只保留一个备份文件

**File:** `packages/hook/src/log.ts:26`
**Issue:** 轮转时 `renameSync(logPath, \`${logPath}.1\`)` 只保留一个 `.1` 备份。如果 `.1` 已存在，会被覆盖。在高频写入场景下可能丢失历史日志。
**Fix:** V0 阶段可接受。未来可考虑多级轮转（`.1` → `.2` → `.3`）或按日期归档。

### IN-03: store.ts 中 prepared statement 每次调用重新创建

**File:** `packages/hook/src/store.ts:56-59`
**Issue:** `db.query(...)` 在每次 `persistEvent` 调用时创建新的 Statement 对象。虽然 bun:sqlite 内部会缓存编译后的语句，但将 Statement 提升为模块级变量可避免对象创建开销。
**Fix:** V0 阶段可接受。性能优化时可将高频使用的 statement 提升为模块级常量。

### IN-04: cli.ts 中日期解析未验证有效性

**File:** `packages/hook/src/cli.ts:116-119`
**Issue:** `--from` 和 `--to` 参数通过 `new Date(value).getTime()` 解析。如果用户传入无效日期字符串，`Date` 构造函数返回 `NaN`，后续 `Math.floor(NaN / 1000)` 仍为 `NaN`，传递给 `queryEvents` 的 `$from` 或 `$to` 参数为 `NaN`。SQLite 中 `ts >= NaN` 始终为 false，导致返回空结果——行为正确但错误信息不明确。
**Fix:** 添加日期有效性检查：
```typescript
if (fromArg) {
  const date = new Date(fromArg.split('=')[1])
  if (isNaN(date.getTime())) {
    console.error(`Invalid date: ${fromArg.split('=')[1]}`)
    process.exit(1)
  }
  options.from = Math.floor(date.getTime() / 1000)
}
```

### IN-05: install.ts 中 HOOK_BINARY_PATH 检测逻辑可能误判

**File:** `packages/hook/src/install.ts:11-13`
**Issue:** `process.execPath.includes('vibetime')` 用于判断是否为编译后的二进制。如果用户从路径中包含 'vibetime' 的目录运行 bun/node（如 `/home/vibetime-dev/bun run ...`），会误判为编译二进制，导致 `HOOK_BINARY_PATH` 指向 bun/node 可执行文件而非 vibetime-hook。
**Fix:** V0 阶段可接受（此场景极为罕见）。更健壮的方案是检查 `process.argv[1]` 是否包含 'vibetime-hook' 或使用编译时注入的标记。

---

_Reviewed: 2026-04-29T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
