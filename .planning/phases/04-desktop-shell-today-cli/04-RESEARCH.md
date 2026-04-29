# Phase 4: Desktop Shell, Today View & CLI - Research

**Researched:** 2026-04-29
**Domain:** Electron desktop app, IPC architecture, React renderer, CLI enhancement
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Fine-grained IPC methods (one invoke per query, not generic query interface)
- D-02: Shared types file at `packages/desktop/src/shared/ipc-types.ts`
- D-03: Minimal method set for Phase 4: `getTodaySummary`, `getOpenTurns`, `getAgentStatus`, `getConfig`, `updateConfig`, `installAgent`
- D-04: Result wrapper: `{ ok: true, data: T } | { ok: false, error: string }`
- D-05: Enhanced hook CLI — desktop main process calls hook's `runCli()` for CLI mode
- D-06: chalk for colored output
- D-07: vibetime binary CLI subcommands execute in hook package
- D-08: Custom `useIpcQuery` hook + Jotai atoms (no React Query)
- D-09: ~~SQLite updateHook event-driven push~~ **BLOCKED — see Critical Finding below**
- D-10: Jotai atom direct update on push
- D-11: Standard three-layer: `main/`, `preload/`, `renderer/`
- D-12: Strict security: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- D-13: electron-vite build framework
- D-14: react-router-dom for Today/Live/History/Settings views

### Claude's Discretion
- Today view bar visualization implementation (ECharts bar or CSS)
- Settings panel agent status detection logic
- electron-vite specific configuration
- preload script exact API surface

### Deferred Ideas (OUT OF SCOPE)
- Live view animation and 30fps requirements -> Phase 5
- History view (heatmap + trends + table) -> Phase 5
- Menubar widget -> Phase 5
- Auto-launch on login -> Phase 5 (SET-04)
- Close-to-menubar lifecycle -> Phase 5 (LIFE-01, LIFE-02)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TODAY-01 | Today view is the default landing view on app launch | electron-vite renderer entry + react-router default route |
| TODAY-02 | Today view shows today's date, grand total, per-project rows sorted by total time desc, with bar visualization, plus per-project agent breakdown | IPC `getTodaySummary` + CSS/ECharts bar rendering |
| TODAY-03 | Today view footer shows turn count and active project count | Included in `getTodaySummary` response |
| TODAY-04 | Today view auto-refreshes approximately every 5 seconds | Application-level push via main process event emitter (D-09 workaround) |
| CLI-03 | `vibetime today` prints a plain-text per-project breakdown of today's agent time and exits | Enhance hook CLI `today` subcommand with chalk formatting |
| CLI-04 | `vibetime project <name> [--days=N]` prints a per-day + per-agent breakdown for one project | Enhance hook CLI `project` subcommand |
| CLI-05 | `vibetime export [--format=json|csv] [--out=<path>] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]` | Enhance hook CLI `export` subcommand with CSV support |
| CLI-06 | `vibetime version` prints version and `~/.vibetime/data.db` path | Already implemented in Phase 3 |
| CLI-07 | `vibetime` (no args) launches the desktop application | Desktop main process entry point detection |
| SET-01 | Settings panel includes a Connect Agents section with per-agent install button + status indicator | IPC `installAgent` + `getAgentStatus` |
| SET-02 | Settings panel includes a Project Aliases view/editor for `cwd -> name` mappings | IPC `getConfig` + `updateConfig` |
| SET-03 | Settings panel includes an About section showing version, `~/.vibetime/data.db` path, and the MIT license | IPC `getConfig` or static data |
| IPC-01 | Renderer never opens SQLite directly. All renderer reads/writes go through typed Electron IPC methods | Preload script + contextBridge + ipcMain.handle |
| DESIGN-01 | Renderer applies the Tokyo Night palette tokens, Inter + JetBrains Mono typography, ECharts custom theme | Tailwind CSS config + ECharts theme registration |
</phase_requirements>

## Summary

Phase 4 establishes the Electron desktop application shell, the Today view as default landing, the complete CLI surface, and minimal Settings. The architecture follows the locked three-layer pattern (main/preload/renderer) built with electron-vite.

**Critical finding:** better-sqlite3 v12.9.0 does NOT expose `updateHook()` (verified by installing and testing). The locked decision D-09 assumes this API exists. The recommended workaround is application-level event emission: since the main process is the sole writer to SQLite (IPC-01), wrap all write operations in a thin layer that emits change events to the renderer via `webContents.send()`. This achieves the same zero-polling, event-driven goal without depending on an API that doesn't exist.

**Critical finding #2:** electron-vite v5.0.0 requires Node.js 20.19+ or 22.12+. The current environment runs Node.js 22.7.0, which is NOT supported. Node.js must be upgraded to 22.12+ before Phase 4 implementation can begin.

**Primary recommendation:** Proceed with the locked decisions, replacing D-09's `updateHook` with application-level event emission. Upgrade Node.js to 22.12+ before implementation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SQLite queries | Main process | -- | better-sqlite3 runs in Node.js main process only |
| IPC method handlers | Main process | -- | ipcMain.handle() lives in main process |
| Preload bridge | Preload script | -- | contextBridge.exposeInMainWorld() bridges main<->renderer |
| React UI rendering | Renderer | -- | React DOM renders in Chromium renderer process |
| CLI command execution | Hook package | Main process | D-07: CLI runs in hook package; D-05: desktop main calls runCli() |
| Data push to renderer | Main process | -- | webContents.send() after write operations |
| Jotai state updates | Renderer | -- | store.set() in IPC event listener |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.3.0 | Desktop shell | Locked (DEC-001) |
| electron-vite | 5.0.0 | Build framework for main/preload/renderer | Locked (D-13) |
| react | 19.2.5 | UI framework | Locked (DEC-002) |
| react-dom | 19.2.5 | React renderer | Locked (DEC-002) |
| react-router-dom | 7.14.2 | View routing (Today/Live/History/Settings) | Locked (D-14) |
| jotai | 2.19.1 | State management | Locked (DEC-002) |
| better-sqlite3 | 12.9.0 | SQLite in main process | Locked (DEC-005) |
| tailwindcss | 4.2.4 | Utility CSS | Locked (DEC-002) |
| echarts | 6.0.0 | Charts (Today bar, History heatmap) | Locked (DEC-002) |
| chalk | 5.6.2 | Terminal colors for CLI | Locked (D-06) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | 7.6.13 | TypeScript types for better-sqlite3 | Always (main process) |
| coss-ui | 0.0.0 | UI component registry (copy-paste) | Settings table, buttons, inputs |
| echarts-for-react | -- | React wrapper for ECharts | If needed for Today bar chart |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-vite | electron-forge + Vite | More config, but works with Node 22.7 |
| chalk | kleur | Lighter (~3KB), but chalk is locked |
| Application-level push | SQLite updateHook | updateHook doesn't exist in better-sqlite3 |

**Installation:**
```bash
cd packages/desktop
pnpm add electron better-sqlite3 react react-dom react-router-dom jotai echarts chalk
pnpm add -D electron-vite @types/better-sqlite3 @types/react @types/react-dom tailwindcss
```

**Version verification:** All versions verified via `npm view` on 2026-04-29.

## Architecture Patterns

### System Architecture Diagram

```
User launches vibetime (no args)
        |
        v
  Electron Main Process
  ├── CLI mode? ──yes──> hook/runCli() ──> stdout + exit
  │
  └── GUI mode
      ├── better-sqlite3 ──> ~/.vibetime/data.db
      ├── ipcMain.handle() ──> typed IPC methods
      │   ├── getTodaySummary()
      │   ├── getOpenTurns()
      │   ├── getAgentStatus()
      │   ├── getConfig()
      │   ├── updateConfig()
      │   └── installAgent()
      ├── webContents.send() ──> push on DB write
      └── BrowserWindow
          ├── preload.ts ──> contextBridge.exposeInMainWorld()
          │   └── window.api.invoke(channel, args)
          │   └── window.api.onPush(callback)
          └── Renderer (React)
              ├── Jotai store (outside React)
              ├── useIpcQuery hook
              ├── React Router
              │   ├── / (Today view) ── default
              │   ├── /live (Phase 5)
              │   ├── /history (Phase 5)
              │   └── /settings
              └── Tailwind + Tokyo Night tokens
```

### Recommended Project Structure

```
packages/desktop/
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json          # for main/preload
├── tsconfig.web.json           # for renderer
├── src/
│   ├── shared/
│   │   └── ipc-types.ts        # D-02: shared IPC types
│   ├── main/
│   │   ├── index.ts            # Electron main entry
│   │   ├── ipc-handlers.ts     # ipcMain.handle() registrations
│   │   ├── db.ts               # better-sqlite3 wrapper + event emitter
│   │   └── cli.ts              # CLI mode detection + runCli()
│   ├── preload/
│   │   └── index.ts            # contextBridge.exposeInMainWorld()
│   └── renderer/
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx        # React entry point
│       │   ├── App.tsx         # Router setup
│       │   ├── store.ts        # Jotai createStore() singleton
│       │   ├── hooks/
│       │   │   └── useIpcQuery.ts  # D-08: custom IPC query hook
│       │   ├── views/
│       │   │   ├── Today.tsx
│       │   │   └── Settings.tsx
│       │   ├── components/
│       │   │   ├── Sidebar.tsx
│       │   │   └── TodayBar.tsx
│       │   └── charts/
│       │       └── theme.ts    # ECharts Tokyo Night theme
│       └── tailwind.config.ts
└── resources/
    └── icon.png
```

### Pattern 1: Typed IPC with Result Wrapper

**What:** Each IPC method has a typed name, argument, and return value defined in a shared file. All returns use a Result wrapper.

**When to use:** Every IPC call between renderer and main process.

**Example:**
```typescript
// src/shared/ipc-types.ts
export interface IpcMethods {
  getTodaySummary: {
    args: void
    result: TodaySummary
  }
  getOpenTurns: {
    args: void
    result: OpenTurn[]
  }
  getAgentStatus: {
    args: void
    result: AgentStatus[]
  }
  getConfig: {
    args: void
    result: VibetimeConfig
  }
  updateConfig: {
    args: Partial<VibetimeConfig>
    result: void
  }
  installAgent: {
    args: { agent: string }
    result: void
  }
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type TodaySummary = {
  date: string
  grandTotal: number  // seconds
  projects: Array<{
    name: string
    total: number  // seconds
    agents: Array<{ agent: string; total: number }>
  }>
  turnCount: number
  activeProjectCount: number
}
```

### Pattern 2: Preload Bridge with Sandbox

**What:** Preload script exposes a minimal API surface via contextBridge. Only `invoke` (request/response) and `onPush` (server-push events) are exposed.

**When to use:** All renderer-to-main and main-to-renderer communication.

**Example:**
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  onPush: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('push', handler)
    return () => { ipcRenderer.removeListener('push', handler) }
  },
})
```

### Pattern 3: Application-Level Event Emission (D-09 Workaround)

**What:** Since better-sqlite3 lacks `updateHook`, the main process wraps DB write operations in a thin layer that emits change events to the renderer after each write.

**When to use:** Every DB write operation in the main process.

**Example:**
```typescript
// src/main/db.ts
import Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function notifyRenderer(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('push', { type: 'db-changed' })
  }
}

// Wrapper that notifies after write
export function writeAndNotify(fn: () => void): void {
  fn()
  notifyRenderer()
}
```

### Pattern 4: Jotai Store Outside React

**What:** Create a Jotai store singleton outside React, pass it to `<Provider>`, and update atoms from IPC push handlers.

**When to use:** Renderer-side state management for IPC data.

**Example:**
```typescript
// src/renderer/src/store.ts
import { createStore, atom } from 'jotai'

export const store = createStore()

export const todaySummaryAtom = atom<TodaySummary | null>(null)
export const configAtom = atom<VibetimeConfig | null>(null)

// Called from preload push handler
export function handlePush(data: { type: string }): void {
  if (data.type === 'db-changed') {
    // Re-fetch affected atoms
    window.api.invoke('getTodaySummary').then((result) => {
      if (result.ok) store.set(todaySummaryAtom, result.data)
    })
  }
}
```

### Anti-Patterns to Avoid

- **Generic query IPC:** Never expose raw SQL or a generic `query()` method to the renderer (violates IPC-01 security)
- **Polling in renderer:** Never use `setInterval` for data refresh; use push from main process
- **Direct SQLite in renderer:** Never import better-sqlite3 or bun:sqlite in renderer code
- **Missing error handling:** Always wrap IPC calls in try/catch and return `{ ok: false, error }` (D-04)
- **Sandbox violations:** Never set `sandbox: false` or `nodeIntegration: true` (D-12)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IPC type safety | Manual d.ts declarations | Shared `ipc-types.ts` (D-02) | Compile-time guarantee, single source of truth |
| CLI colored output | ANSI escape codes | chalk (D-06) | Handles terminal detection, 256-color, Windows |
| TOML parsing | Custom parser (already exists in hook) | Reuse hook's `config.ts` | Already implemented and tested |
| SQLite queries | Raw SQL strings everywhere | Prepared statements via store.ts patterns | Already proven in Phase 3 |
| Router | Manual view switching | react-router-dom (D-14) | Standard, supports URL-based navigation |

**Key insight:** The hook package already has working implementations for DB queries, config read/write, install logic, and CLI parsing. The desktop package should import and reuse these, not reimplement them.

## Common Pitfalls

### Pitfall 1: electron-vite Node.js Version Incompatibility
**What goes wrong:** electron-vite v5.0.0 requires Node.js 20.19+ or 22.12+. Current environment is 22.7.0.
**Why it happens:** electron-vite uses Vite 5+ features that require specific Node.js versions.
**How to avoid:** Upgrade Node.js to 22.12+ before starting Phase 4 implementation.
**Warning signs:** Build errors about unsupported Node.js version, `require(esm)` failures.

### Pitfall 2: better-sqlite3 updateHook Does Not Exist
**What goes wrong:** D-09 assumes `db.updateHook()` exists in better-sqlite3. It does not (verified on v12.9.0).
**Why it happens:** The API was never implemented in better-sqlite3. The SQLite C API `sqlite3_update_hook` is not exposed.
**How to avoid:** Use application-level event emission (see Pattern 3). Since the main process is the sole writer, emit events after each write.
**Warning signs:** `db.updateHook is not a function` at runtime.

### Pitfall 3: Preload Script Sandbox Limitations
**What goes wrong:** With `sandbox: true`, preload scripts can only import `contextBridge`, `ipcRenderer`, `events`, `timers`, `url`. No `fs`, `path`, `crypto`, etc.
**Why it happens:** Electron's sandbox restricts preload to a minimal API surface for security.
**How to avoid:** Keep preload minimal — only bridge IPC. All logic lives in main process or renderer.
**Warning signs:** `Module not found` errors for Node.js built-ins in preload.

### Pitfall 4: electron-vite Working Directory Shift
**What goes wrong:** At runtime, Electron's working directory is the output folder (`out/`), not the source root. File paths referencing source files will break.
**Why it happens:** electron-vite bundles to `out/` and Electron runs from there.
**How to avoid:** Use `app.getPath()` or `__dirname` relative paths, never absolute source paths.
**Warning signs:** `ENOENT` errors for config files or database paths at runtime.

### Pitfall 5: chalk v5 is ESM-Only
**What goes wrong:** chalk v5 uses ES modules exclusively. If the hook package uses CommonJS, importing chalk will fail.
**Why it happens:** chalk v5 dropped CommonJS support.
**How to avoid:** The hook package is already `"type": "module"`, so chalk v5 works. Verify `package.json` has `"type": "module"`.
**Warning signs:** `ERR_REQUIRE_ESM` when importing chalk.

### Pitfall 6: coss ui is a Copy-Paste Registry, Not an npm Package
**What goes wrong:** Expecting `pnpm add coss-ui` to provide components. The npm package is a placeholder at v0.0.0.
**Why it happens:** coss ui follows the shadcn/ui model — you copy component source files into your project.
**How to avoid:** Copy needed components (Button, Input, Table, etc.) from coss.com/ui/docs into `src/renderer/src/components/`. For Phase 4, only basic form components are needed for Settings.
**Warning signs:** Empty or missing component exports from `coss-ui`.

## Code Examples

Verified patterns from official sources:

### electron-vite Configuration
```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    // Vite config for React renderer
    plugins: [react()],  // @vitejs/plugin-react
  },
})
```

### IPC Handler Registration
```typescript
// src/main/ipc-handlers.ts
import { ipcMain } from 'electron'
import type { IpcMethods, IpcResult } from '../shared/ipc-types'

export function registerIpcHandlers(): void {
  ipcMain.handle('getTodaySummary', async (): Promise<IpcResult<TodaySummary>> => {
    try {
      const db = getDb()
      // ... query logic
      return { ok: true, data: summary }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
```

### useIpcQuery Hook
```typescript
// src/renderer/src/hooks/useIpcQuery.ts
import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { store } from '../store'

export function useIpcQuery<T>(channel: string, atom: Atom<T>) {
  const data = useAtomValue(atom)

  useEffect(() => {
    // Initial fetch
    window.api.invoke(channel).then((result) => {
      if (result.ok) store.set(atom, result.data)
    })

    // Subscribe to push updates
    const unsubscribe = window.api.onPush((pushData) => {
      if (pushData.type === 'db-changed') {
        window.api.invoke(channel).then((result) => {
          if (result.ok) store.set(atom, result.data)
        })
      }
    })

    return unsubscribe
  }, [channel])

  return data
}
```

### CLI Mode Detection
```typescript
// src/main/index.ts
import { app } from 'electron'

const isCliMode = process.argv.length > 2

if (isCliMode) {
  // CLI mode: run headless and exit
  const { runCli } = await import('@vibetime/hook')
  await runCli()
  app.quit()
} else {
  // GUI mode: launch Electron window
  // ... BrowserWindow setup
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `db.updateHook()` assumption | Application-level event emission | 2026-04-29 (research) | D-09 must be revised; same zero-polling goal achieved differently |
| electron-vite with any Node 22 | Node.js 22.12+ required | electron-vite 5.0.0 | Must upgrade Node.js before implementation |

**Deprecated/outdated:**
- `externalizeDepsPlugin()` — still works in electron-vite 5 but the new `build.externalizeDeps` config is preferred
- CommonJS preload scripts — electron-vite 5 supports ESM for main/preload via `"type": "module"`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | coss ui components can be copied into the project and used with Tailwind v4 | Standard Stack | May need to adapt component styles; low risk since it's copy-paste |
| A2 | electron-vite v5.0.0 works with Node.js 22.12+ (not just 20.19+) | Pitfall 1 | If only 20.19+ is supported, need Node 20 LTS |
| A3 | The hook package's `runCli()` can be called from the desktop main process without modification | CLI-07 | May need to adjust `process.argv` handling |
| A4 | better-sqlite3's synchronous API is acceptable for IPC handlers (no need for async) | Pattern 1 | SQLite queries are fast (<1ms for simple queries); async would add complexity |
| A5 | `webContents.send()` from main process works with sandbox: true preload | Pattern 3 | Verified: ipcRenderer.on() is available in sandboxed preload |

## Open Questions

1. **Node.js version upgrade path**
   - What we know: Current 22.7.0 is NOT supported by electron-vite 5.0.0
   - What's unclear: Whether nvm or system upgrade is preferred
   - Recommendation: Upgrade to Node.js 22.12+ (LTS) before Phase 4 implementation

2. **coss ui component selection for Phase 4**
   - What we know: coss ui has 50+ components; Phase 4 needs Button, Input, Table, and basic form elements for Settings
   - What's unclear: Exact component names and API
   - Recommendation: Copy only needed components from coss.com/ui/docs; can defer to plain Tailwind if coss ui setup is complex

3. **ECharts vs CSS for Today view bar visualization**
   - What we know: ECharts is locked for History view (Phase 5); Today view bar is Claude's discretion
   - What's unclear: Whether ECharts overhead is justified for simple horizontal bars
   - Recommendation: Use CSS bars for Today view (simpler, lighter, sufficient for horizontal bars); reserve ECharts for History view's complex charts

4. **Hook package dependency for desktop CLI mode**
   - What we know: D-05 says desktop main calls hook's `runCli()`; D-07 says CLI runs in hook package
   - What's unclear: Whether `@vibetime/hook` needs to be a dependency of `@vibetime/desktop`
   - Recommendation: Add `@vibetime/hook: "workspace:*"` to desktop's dependencies; import `runCli` directly

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | electron-vite, all packages | YES | 22.7.0 | Must upgrade to 22.12+ |
| pnpm | Monorepo management | YES | 10.33.2 | -- |
| Electron | Desktop shell | Install needed | 41.3.0 (npm) | -- |
| better-sqlite3 | Main process SQLite | Install needed | 12.9.0 (npm) | -- |
| React | Renderer UI | Install needed | 19.2.5 (npm) | -- |
| electron-vite | Build framework | Install needed | 5.0.0 (npm) | -- |

**Missing dependencies with no fallback:**
- Node.js 22.12+ — electron-vite 5.0.0 will not work with 22.7.0

**Missing dependencies with fallback:**
- All npm packages — install via `pnpm add` when implementation begins

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 (existing) |
| Config file | `packages/desktop/vitest.config.ts` (Wave 0) |
| Quick run command | `pnpm --filter @vibetime/desktop test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TODAY-01 | Today view is default landing | unit | `vitest run tests/today.test.ts` | Wave 0 |
| TODAY-02 | Today view shows date, total, per-project breakdown, bars, agent breakdown | unit | `vitest run tests/today.test.ts` | Wave 0 |
| TODAY-03 | Footer shows turn count and active project count | unit | `vitest run tests/today.test.ts` | Wave 0 |
| TODAY-04 | Auto-refresh ~5 seconds | unit | `vitest run tests/ipc-push.test.ts` | Wave 0 |
| CLI-03 | `vibetime today` prints breakdown | unit | `vitest run tests/cli-today.test.ts` | Wave 0 |
| CLI-04 | `vibetime project` prints drilldown | unit | `vitest run tests/cli-project.test.ts` | Wave 0 |
| CLI-05 | `vibetime export` JSON/CSV | unit | `vitest run tests/cli-export.test.ts` | Wave 0 |
| CLI-06 | `vibetime version` prints version | existing | `vitest run tests/cli.test.ts` | Yes |
| CLI-07 | `vibetime` (no args) launches desktop | manual | -- | -- |
| SET-01 | Connect Agents install + status | unit | `vitest run tests/settings.test.ts` | Wave 0 |
| SET-02 | Project Aliases editor | unit | `vitest run tests/settings.test.ts` | Wave 0 |
| SET-03 | About section | unit | `vitest run tests/settings.test.ts` | Wave 0 |
| IPC-01 | Renderer never opens SQLite | lint | dep-cruiser rule | Wave 0 |
| DESIGN-01 | Tokyo Night palette + typography | visual | manual verification | -- |

### Sampling Rate
- **Per task commit:** `pnpm --filter @vibetime/desktop test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/desktop/vitest.config.ts` — desktop test config
- [ ] `packages/desktop/src/shared/ipc-types.test.ts` — type contract tests
- [ ] `packages/desktop/src/main/ipc-handlers.test.ts` — IPC handler tests
- [ ] `packages/desktop/src/renderer/src/hooks/useIpcQuery.test.ts` — hook tests
- [ ] Framework install: `pnpm add -D vitest` in desktop package (already in root)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in V0 (local-only app) |
| V3 Session Management | No | No sessions in V0 |
| V4 Access Control | No | Single-user local app |
| V5 Input Validation | Yes | Validate IPC arguments in handlers; sanitize config.toml input |
| V6 Cryptography | No | No encryption needed (local SQLite) |

### Known Threat Patterns for Electron Apps

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer code injection | Elevation of Privilege | contextIsolation: true + sandbox: true + nodeIntegration: false (D-12) |
| IPC channel spoofing | Tampering | Whitelist allowed IPC channels in preload; validate all args |
| Preload API leakage | Information Disclosure | contextBridge isolates exposed API; no raw ipcRenderer exposed |
| Config.toml injection | Tampering | Validate TOML input in updateConfig; use existing parseToml |

## Sources

### Primary (HIGH confidence)
- electron-vite docs (electron-vite.org) — configuration, preload, dependency handling, security
- Electron docs (electronjs.org) — sandbox preload limitations, contextBridge API
- Jotai docs (jotai.org) — createStore, store.set() outside React
- better-sqlite3 v12.9.0 — verified NO updateHook via installation test
- coss ui docs (coss.com/ui/docs) — component registry model, available components

### Secondary (MEDIUM confidence)
- Web search results for electron-vite preload patterns
- PRD vibetime-prd.md sections 10.2, 10.3, 11, 12

### Tertiary (LOW confidence)
- Web search claim that better-sqlite3 has updateHook (contradicted by actual installation test)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm, locked decisions documented
- Architecture: HIGH — electron-vite patterns well-documented, IPC pattern is standard Electron
- Pitfalls: HIGH — updateHook absence verified by installation test; Node.js version incompatibility verified

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days — stable technologies, no fast-moving changes expected)
