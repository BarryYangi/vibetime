---
phase: 04-desktop-shell-today-cli
reviewed: 2026-04-29T12:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - packages/desktop/electron.vite.config.ts
  - packages/desktop/package.json
  - packages/desktop/src/main/db.ts
  - packages/desktop/src/main/hook-cli.d.ts
  - packages/desktop/src/main/index.ts
  - packages/desktop/src/main/ipc-handlers.ts
  - packages/desktop/src/preload/index.ts
  - packages/desktop/src/renderer/index.html
  - packages/desktop/src/renderer/src/App.tsx
  - packages/desktop/src/renderer/src/charts/theme.ts
  - packages/desktop/src/renderer/src/components/Sidebar.tsx
  - packages/desktop/src/renderer/src/hooks/useIpcQuery.ts
  - packages/desktop/src/renderer/src/index.css
  - packages/desktop/src/renderer/src/main.tsx
  - packages/desktop/src/renderer/src/store.ts
  - packages/desktop/src/renderer/src/views/Settings.tsx
  - packages/desktop/src/renderer/src/views/Today.tsx
  - packages/desktop/src/renderer/src/vite-env.d.ts
  - packages/desktop/src/shared/ipc-types.ts
  - packages/desktop/tailwind.config.ts
  - packages/desktop/tsconfig.json
  - packages/desktop/tsconfig.node.json
  - packages/desktop/tsconfig.web.json
  - packages/hook/package.json
  - packages/hook/src/cli.test.ts
  - packages/hook/src/cli.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-29T12:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 04 实现了 Electron 桌面壳、CLI 子命令、IPC 数据层和 Today/Settings 视图。整体架构清晰：main 进程管理 DB 和 IPC，preload 做 contextBridge，renderer 用 Jotai + React Router。类型安全贯穿 shared/ipc-types.ts。

发现 5 个 Warning 和 6 个 Info。无 Critical。主要关注点：Tailwind v4 构建集成可能缺失、IPC 边界缺少参数校验、类型安全被 `as never` 绕过。

## Warnings

### WR-01: Tailwind CSS v4 构建集成可能缺失

**File:** `packages/desktop/electron.vite.config.ts:12-19`, `packages/desktop/package.json:31`

**Issue:** CSS 使用 `@import "tailwindcss"` (Tailwind v4 语法)，但 `electron.vite.config.ts` 的 renderer plugins 仅有 `react()`，缺少 `@tailwindcss/vite` 插件。`package.json` 也未声明 `@tailwindcss/vite` 或 `@tailwindcss/postcss` 依赖。若无构建插件处理，`@import "tailwindcss"` 和 `@theme` 指令不会被编译，所有 Tailwind 工具类（`flex`, `h-screen`, `bg-tn-bg-dark` 等）将无样式输出。

**Fix:** 添加 Tailwind v4 Vite 插件：
```bash
pnpm -F @vibetime/desktop add -D @tailwindcss/vite
```
```ts
// electron.vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // ...
  renderer: {
    plugins: [react(), tailwindcss()],
  },
})
```

### WR-02: installAgent IPC 处理器缺少白名单校验

**File:** `packages/desktop/src/main/ipc-handlers.ts:55-62`

**Issue:** `installAgent` IPC handler 直接将 renderer 传来的 `agent` 字符串透传给 `installAgent()` 函数，未校验是否属于合法值 (`claude-code`, `codex`, `cursor`)。虽然后续函数内部可能校验，但 IPC 边界应做第一层防御。

**Fix:**
```ts
const ALLOWED_AGENTS = ['claude-code', 'codex', 'cursor'] as const

ipcMain.handle('installAgent', async (_event, { agent }): Promise<IpcResult<void>> => {
  if (!ALLOWED_AGENTS.includes(agent as typeof ALLOWED_AGENTS[number])) {
    return { ok: false, error: `Unknown agent: ${agent}` }
  }
  try {
    writeAndNotify(() => installAgent(agent))
    return { ok: true, data: undefined }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})
```

### WR-03: useIpcQuery 类型安全绕过及重复订阅

**File:** `packages/desktop/src/renderer/src/hooks/useIpcQuery.ts:11-19`

**Issue:** 两处使用 `as never` 绕过类型检查（第 11 行 `channel as never`，第 14 行 `atom as never`），使 IPC 调用完全失去类型保护。此外，每个使用 `useIpcQuery` 的组件都会在 effect 中调用 `window.api.onPush(handlePush)` 注册新的订阅。若有 N 个组件使用此 hook，每次 push 事件会触发 N 次 `handlePush`，导致 N 次冗余的 `getTodaySummary` 请求。

**Fix:** 将 push 订阅提升到 store 层，只订阅一次；使用泛型约束替代 `as never`：
```ts
export function useIpcQuery<K extends IpcChannel>(
  channel: K,
  atom: Atom<IpcMethods[K]['result'] | null>,
): IpcMethods[K]['result'] | null {
  const data = useAtomValue(atom)

  useEffect(() => {
    window.api.invoke(channel).then((result) => {
      if (result.ok) store.set(atom, result.data)
    })
  }, [channel, atom])

  return data
}
```
同时在 `store.ts` 或 `main.tsx` 中将 `onPush` 订阅集中为单一实例。

### WR-04: About 组件发起无意义 IPC 调用

**File:** `packages/desktop/src/renderer/src/views/Settings.tsx:185-194`

**Issue:** `About` 组件在 `useEffect` 中调用 `getConfig` IPC，但返回值完全被忽略，仅设置硬编码值 `version='0.0.0-dev'` 和 `dbPath='~/.vibetime/data.db'`。这是一次无意义的 IPC 往返。

**Fix:** 移除 useEffect 中的 IPC 调用，直接使用硬编码值或从 main 进程获取真实值：
```ts
function About() {
  return (
    <section>
      {/* 直接渲染，无需 state 和 effect */}
      <div className="bg-tn-surface rounded-lg p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-tn-muted">Version</span>
          <span className="font-mono text-tn-fg">0.0.0-dev</span>
        </div>
        {/* ... */}
      </div>
    </section>
  )
}
```

### WR-05: db.ts queryAgentStatus 依赖可能为 undefined 的 HOME

**File:** `packages/desktop/src/main/db.ts:118-135`

**Issue:** `queryAgentStatus` 使用 `process.env.HOME` 拼接路径。在某些环境下 `HOME` 可能为 `undefined`（如 Windows 服务账户），导致路径变为 `undefined/.claude/settings.json`，`existsSync` 会静默返回 `false` 而非报错。虽然有 `try/catch` 兜底，但行为不透明。

**Fix:** 使用 `homedir()` 函数（已在文件顶部导入）替代 `process.env.HOME`：
```ts
case 'claude-code': {
  const path = join(homedir(), '.claude', 'settings.json')
  // ...
}
```

## Info

### IN-01: cli.ts fmtDuration 函数重复定义

**File:** `packages/hook/src/cli.ts:97-103`, `packages/hook/src/cli.ts:178-184`

**Issue:** `fmtDuration` 在 `today` 和 `project` 子命令中各定义一次，代码完全相同。

**Fix:** 提取为模块级私有函数，在两处复用。

### IN-02: tailwind.config.ts 可能为死代码

**File:** `packages/desktop/tailwind.config.ts`

**Issue:** Tailwind v4 使用 CSS-first 配置（`@theme` 块在 `index.css` 中）。若未通过 `@config` 指令引用，`tailwind.config.ts` 不会被加载。且 CSS `@theme` 和 config 中的颜色定义完全重复，存在不一致风险。

**Fix:** 若确认使用 CSS-first 方式，删除 `tailwind.config.ts`。否则在 CSS 中添加 `@config './tailwind.config.ts'`。

### IN-03: CLI 模式检测逻辑脆弱

**File:** `packages/desktop/src/main/index.ts:5`

**Issue:** `process.argv.length > 2` 作为 CLI 模式判断依据。若 Electron 启动时传入额外 flag（如 `--no-sandbox`），会误判为 CLI 模式。

**Fix:** 使用显式子命令检测：
```ts
const CLI_COMMANDS = ['install', 'today', 'project', 'export', 'version', 'help']
const isCliMode = CLI_COMMANDS.includes(process.argv[2])
```

### IN-04: Settings handleSave 无错误反馈

**File:** `packages/desktop/src/renderer/src/views/Settings.tsx:90-98`

**Issue:** `handleSave` 若 `updateConfig` 失败，用户看不到任何错误提示。catch 被吞掉。

**Fix:** 添加错误状态并展示给用户。

### IN-05: handlePush 仅刷新 todaySummary

**File:** `packages/desktop/src/renderer/src/store.ts:9-15`

**Issue:** `handlePush` 在收到 `db-changed` 事件时仅重新获取 `getTodaySummary`。若有其他数据依赖 DB（如 `getOpenTurns`），它们不会自动刷新。

**Fix:** 在 `handlePush` 中同时刷新所有 DB 相关数据，或引入通用的失效机制。

### IN-06: updateConfig 浅合并未校验输入形状

**File:** `packages/desktop/src/main/ipc-handlers.ts:45-53`

**Issue:** `writeConfig({ ...current, ...config })` 使用浅合并，未校验 `config` 的键是否属于 `VibetimeConfig` 的合法字段。恶意或错误的键会被写入配置文件。

**Fix:** 提取合法字段后再合并：
```ts
const { projects, display } = config as Partial<VibetimeConfig>
writeConfig({
  ...current,
  ...(projects !== undefined && { projects }),
  ...(display !== undefined && { display }),
})
```

---

_Reviewed: 2026-04-29T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
